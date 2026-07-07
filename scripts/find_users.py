import urllib.request, json

url = "https://hmxxqacnzxqpcheoeidn.supabase.co/rest/v1"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhteHhxYWNuenhxcGNoZW9laWRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNDUwODU5NywiZXhwIjoyMDQwMDg0NTk3fQ.zGzcyZkGCAUEylPK_q-MxMG3ueEij-ConUy0t4-hK3E"
headers = {"apikey": key, "Authorization": f"Bearer {key}"}

# Check all stripe_customers
print("=== All stripe_customers ===")
req = urllib.request.Request(f"{url}/stripe_customers?select=*", headers=headers)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read())
print(f"Total entries: {len(data)}")
for c in data:
    # Get the matching profile
    req2 = urllib.request.Request(f"{url}/profiles?id=eq.{c['user_id']}&select=full_name,email", headers=headers)
    with urllib.request.urlopen(req2) as resp2:
        profiles = json.loads(resp2.read())
    p = profiles[0] if profiles else {}
    print(f"  user_id={c['user_id'][:8]}... stripe={c['stripe_customer_id']} name={p.get('full_name','?')} email={p.get('email','?')}")

# Check the checkout/signup flow - how does stripe_customers get populated?
print("\n=== How stripe_customers gets populated ===")
# The webhook's getUserIdFromCustomer auto-creates entries on first webhook event
# Let's check if there's a checkout function that also creates them

# Check if these users have subscriptions
print("\n=== User subscriptions for Linto/McMorran ===")
for uid in ["8c3d21a7-9fa4-49dc-b3ca-530e2083e8ff", "bfa6aa47-0b42-4df9-b383-ae7d30e5ad69"]:
    req = urllib.request.Request(f"{url}/user_subscriptions?user_id=eq.{uid}&select=*", headers=headers)
    with urllib.request.urlopen(req) as resp:
        sub_data = json.loads(resp.read())
    req2 = urllib.request.Request(f"{url}/profiles?id=eq.{uid}&select=full_name,email", headers=headers)
    with urllib.request.urlopen(req2) as resp2:
        p_data = json.loads(resp2.read())
    name = p_data[0]['full_name'] if p_data else '?'
    print(f"  {name}: {json.dumps(sub_data, indent=4, default=str)}")
