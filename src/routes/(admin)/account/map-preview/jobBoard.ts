/**
 * The farm's jobs: everything posted on this map, kept up to date as people
 * post, take, finish and withdraw them. A job is given to one person or
 * left open for anyone on the crew.
 */
import { writable, type Writable } from "svelte/store"
import {
  cancelJob,
  createJob,
  finishJob,
  loadJobs,
  takeJob,
  watchJobs,
  type Job,
  type JobItem,
} from "./liveData"

export class JobBoard {
  /** Every job on the map that hasn't been withdrawn, the newest first. */
  readonly jobs: Writable<Job[]> = writable([])
  /** Someone has just posted a job that is open to anyone. */
  readonly posted: Writable<Job | null> = writable(null)
  /** A job this person posted has just been taken on or finished. */
  readonly moved: Writable<Job | null> = writable(null)
  readonly problem: Writable<string | null> = writable(null)

  private byId = new Map<string, Job>()
  private stop: (() => void) | null = null

  constructor(
    private mapId: string,
    private userId: string,
    private myName: string,
  ) {}

  start() {
    loadJobs(this.mapId)
      .then((jobs) => {
        for (const job of jobs) this.byId.set(job.id, job)
        this.publish()
      })
      .catch(() => {})
    this.stop = watchJobs(this.mapId, {
      changed: (job) => {
        const before = this.byId.get(job.id)
        this.keep(job)
        if (job.createdBy === this.userId) {
          if (
            before &&
            before.status !== job.status &&
            job.takenBy !== this.userId
          )
            this.moved.set(job)
        } else if (!before && !job.assignedTo && job.status === "open")
          this.posted.set(job)
      },
      gone: (id) => {
        if (this.byId.delete(id)) this.publish()
      },
    })
  }

  destroy() {
    this.stop?.()
    this.stop = null
  }

  private keep(job: Job) {
    this.byId.set(job.id, job)
    this.publish()
  }

  private publish() {
    this.jobs.set(
      [...this.byId.values()].sort((a, b) => b.createdAt - a.createdAt),
    )
  }

  private failed(what: string) {
    this.problem.set(navigator.onLine ? what : `No signal: ${what}`)
  }

  /** Post a job, for one person or (`assignedTo` null) for anyone. */
  async post(job: {
    assignedTo: string | null
    title: string
    note: string
    items: JobItem[]
  }) {
    try {
      const posted = await createJob({
        mapId: this.mapId,
        userId: this.userId,
        name: this.myName,
        ...job,
      })
      this.keep(posted)
      return posted
    } catch {
      this.failed("that job didn't save. Try again.")
      return null
    }
  }

  /** Take a job on. False if someone else got there first. */
  async take(id: string) {
    try {
      const taken = await takeJob(id, this.userId, this.myName)
      if (!taken) {
        this.problem.set("Someone else has taken that one.")
        return false
      }
      this.keep(taken)
      return true
    } catch {
      this.failed("that didn't save. Try again.")
      return false
    }
  }

  async finish(id: string) {
    const job = this.byId.get(id)
    if (!job) return false
    try {
      const done = await finishJob(job, this.userId, this.myName)
      if (done) this.keep(done)
      return !!done
    } catch {
      this.failed("that didn't save. Try again.")
      return false
    }
  }

  /** Withdraw a job this person posted. */
  async cancel(id: string) {
    try {
      await cancelJob(id)
      if (this.byId.delete(id)) this.publish()
      return true
    } catch {
      this.failed("that job couldn't be withdrawn. Try again.")
      return false
    }
  }
}
