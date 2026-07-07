import urllib.request, json

url = "https://hmxxqacnzxqpcheoeidn.supabase.co/rest/v1"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhteHhxYWNuenhxcGNoZW9laWRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNDUwODU5NywiZXhwIjoyMDQwMDg0NTk3fQ.zGzcyZkGCAUEylPK_q-MxMG3ueEij-ConUy0t4-hK3E"
h = {"apikey": key, "Authorization": f"Bearer {key}"}

# Check the past_due user with full UUID
print("\n=== Past due subscriptions (full data) ===")
req_pd = urllib.request.Request(f"{url}/user_subscriptions?subscription_status=eq.past_due&select=*", headers=h)
with urllib.request.urlopen(req_pd) as r:
    pd = json.loads(r.read())
for s in pd:
    uid = s.get("user_id", "?")
    print(f"  user_id={uid}")
    print(f"  sub_id={s.get('stripe_subscription_id')}")
    print(f"  status={s.get('subscription_status')}")
    # Get profile
    req_p = urllib.request.Request(f"{url}/profiles?id=eq.{uid}&select=full_name,email,mobile", headers=h)
    try:
        with urllib.request.urlopen(req_p) as rp:
            p = json.loads(rp.read())
        print(f"  profile={p}")
    except Exception as e:
        print(f"  profile error: {e}")
    # Get stripe customer
    req_sc = urllib.request.Request(f"{url}/stripe_customers?user_id=eq.{uid}&select=stripe_customer_id", headers=h)
    try:
        with urllib.request.urlopen(req_sc) as rsc:
            sc = json.loads(rsc.read())
        print(f"  stripe_customer={sc}")
    except Exception as e:
        print(f"  sc error: {e}")
    print()
