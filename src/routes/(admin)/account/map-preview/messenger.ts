/**
 * Messages between this person and the rest of the crew on the farm: who
 * they have talked to, the conversation that is open, and what has arrived
 * unread. One list of messages is kept and everything else is read off it.
 */
import { get, writable, type Writable } from "svelte/store"
import {
  loadConversation,
  loadMessages,
  markMessagesRead,
  sendMessage,
  watchMessages,
  type Message,
  type SharedPlace,
} from "./liveData"

export type Conversation = {
  /** The other person. */
  id: string
  /** Their name as their own messages give it, if they have written. */
  name: string | null
  last: Message
  /** How many of theirs I haven't opened. */
  unread: number
}

export class Messenger {
  /** Everyone I've exchanged messages with, the latest first. */
  readonly conversations: Writable<Conversation[]> = writable([])
  /** Messages I haven't opened, across everyone. */
  readonly unread = writable(0)
  /** Who the open conversation is with, and its messages, oldest first. */
  readonly withId: Writable<string | null> = writable(null)
  readonly thread: Writable<Message[]> = writable([])
  readonly loading = writable(false)
  readonly sending = writable(false)
  /** A message has just come in that isn't on screen (for a notice). */
  readonly arrived: Writable<Message | null> = writable(null)
  readonly problem: Writable<string | null> = writable(null)
  /** The message list is on screen, so an arriving message needs no notice. */
  private watching = false

  private byId = new Map<number, Message>()
  private stop: (() => void) | null = null

  constructor(
    private mapId: string,
    private userId: string,
    private myName: string,
  ) {}

  start() {
    loadMessages(this.mapId, this.userId)
      .then((messages) => this.merge(messages))
      .catch(() => {})
    this.stop = watchMessages(this.mapId, this.userId, (message) => {
      const reading = this.watching && get(this.withId) === message.from
      this.merge([reading ? { ...message, read: true } : message])
      if (reading) this.markRead(message.from)
      else if (!this.watching) this.arrived.set(message)
    })
  }

  destroy() {
    this.stop?.()
    this.stop = null
  }

  private merge(messages: Message[]) {
    for (const message of messages) this.byId.set(message.id, message)
    this.publish()
  }

  private publish() {
    const all = [...this.byId.values()].sort((a, b) => a.id - b.id)
    const found = new Map<string, Conversation>()
    let unread = 0
    for (const message of all) {
      const mine = message.from === this.userId
      const other = mine ? message.to : message.from
      const convo = found.get(other) ?? {
        id: other,
        name: null,
        last: message,
        unread: 0,
      }
      convo.last = message
      if (!mine) {
        convo.name = message.fromName ?? convo.name
        if (!message.read) {
          convo.unread++
          unread++
        }
      }
      found.set(other, convo)
    }
    this.conversations.set(
      [...found.values()].sort((a, b) => b.last.id - a.last.id),
    )
    this.unread.set(unread)
    const open = get(this.withId)
    this.thread.set(
      open ? all.filter((m) => m.from === open || m.to === open) : [],
    )
  }

  /** Open the conversation with one person, or (null) go back to the list. */
  async open(id: string | null) {
    this.withId.set(id)
    this.publish()
    if (!id) return
    this.markRead(id)
    this.loading.set(true)
    try {
      this.merge(await loadConversation(this.mapId, this.userId, id))
      this.markRead(id)
    } catch {
      // What has already been loaded is still shown.
    } finally {
      this.loading.set(false)
    }
  }

  /** Say whether the messages are on screen. */
  watch(on: boolean) {
    this.watching = on
  }

  /** The open conversation is on screen again: what it holds is read. */
  seen() {
    const open = get(this.withId)
    if (open) this.markRead(open)
  }

  /** Everything this person sent me has now been seen. */
  private markRead(id: string) {
    let changed = false
    for (const message of this.byId.values())
      if (message.from === id && !message.read) {
        this.byId.set(message.id, { ...message, read: true })
        changed = true
      }
    if (!changed) return
    this.publish()
    markMessagesRead(this.mapId, this.userId, id).catch(() => {})
  }

  /** Send a message, a place, or both. */
  async send(
    to: string,
    body: string,
    place: SharedPlace | null,
    online: boolean,
  ) {
    const text = body.trim().slice(0, 500)
    if ((!text && !place) || get(this.sending)) return false
    this.sending.set(true)
    try {
      const sent = await sendMessage({
        mapId: this.mapId,
        from: this.userId,
        fromName: this.myName,
        to,
        body: text,
        place,
        online,
      })
      this.merge([sent])
      return true
    } catch {
      this.problem.set(
        navigator.onLine
          ? "That message didn't send. Try again."
          : "No signal: that message didn't send.",
      )
      return false
    } finally {
      this.sending.set(false)
    }
  }
}
