// src/lib/api/messagesApi.ts
// Direct messages between people on a map (map_messages table).
import { supabase } from "$lib/stores/sessionStore"

export type MapMessage = {
  id: number
  master_map_id: string
  sender_id: string
  sender_name: string | null
  recipient_id: string
  body: string
  created_at: string
  read_at: string | null
}

/** Full conversation between me and one other person (oldest → newest). */
export async function fetchConversation(
  masterMapId: string,
  meId: string,
  otherId: string,
  limit = 100,
): Promise<MapMessage[]> {
  const { data, error } = await supabase
    .from("map_messages")
    .select("*")
    .eq("master_map_id", masterMapId)
    .or(
      `and(sender_id.eq.${meId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${meId})`,
    )
    .order("id", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []).reverse()
}

export async function sendMapMessage({
  masterMapId,
  senderId,
  senderName,
  recipientId,
  body,
}: {
  masterMapId: string
  senderId: string
  senderName: string
  recipientId: string
  body: string
}): Promise<MapMessage> {
  const { data, error } = await supabase
    .from("map_messages")
    .insert({
      master_map_id: masterMapId,
      sender_id: senderId,
      sender_name: senderName,
      recipient_id: recipientId,
      body,
    })
    .select("*")
    .single()
  if (error) throw error
  return data as MapMessage
}

/** Mark everything the other person sent me as read. */
export async function markConversationRead(
  masterMapId: string,
  meId: string,
  otherId: string,
): Promise<void> {
  const { error } = await supabase
    .from("map_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("master_map_id", masterMapId)
    .eq("recipient_id", meId)
    .eq("sender_id", otherId)
    .is("read_at", null)
  if (error) throw error
}

/** Unread counts per sender for the vehicles-list badges. */
export async function fetchUnreadBySender(
  masterMapId: string,
  meId: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("map_messages")
    .select("sender_id")
    .eq("master_map_id", masterMapId)
    .eq("recipient_id", meId)
    .is("read_at", null)
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const row of data || []) {
    counts[row.sender_id] = (counts[row.sender_id] || 0) + 1
  }
  return counts
}
