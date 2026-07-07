import urllib.request, json

url = "https://hmxxqacnzxqpcheoeidn.supabase.co/rest/v1"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhteHhxYWNuenhxcGNoZW9laWRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNDUwODU5NywiZXhwIjoyMDQwMDg0NTk3fQ.zGzcyZkGCAUEylPK_q-MxMG3ueEij-ConUy0t4-hK3E"
h = {"apikey": key, "Authorization": f"Bearer {key}"}

users = [
    ("8c3d21a7-9fa4-49dc-b3ca-530e2083e8ff", "Alex Linto"),
    ("bfa6aa47-0b42-4df9-b383-ae7d30e5ad69", "Josh McMorran"),
]

for uid, name in users:
    print(f"\n=== {name} (id={uid[:8]}) ===")
    
    # Check subscriptions
    req = urllib.request.Request(f"{url}/user_subscriptions?user_id=eq.{uid}&select=*", headers=h)
    with urllib.request.urlopen(req) as r:
        subs = json.loads(r.read())
    
    if subs:
        for s in subs:
            print(f"  Subscription: plan={s.get('plan_type')} status={s.get('subscription_status')}")
            print(f"  stripe_subscription_id: {s.get('stripe_subscription_id', 'NONE')}")
            print(f"  stripe_customer_id: {s.get('stripe_customer_id', 'NONE')}")
            print(f"  current_period_end: {s.get('current_period_end', 'NONE')}")
    else:
        print("  No subscriptions found")
    
    # Check if they're in stripe_customers
    req2 = urllib.request.Request(f"{url}/stripe_customers?user_id=eq.{uid}&select=stripe_customer_id", headers=h)
    with urllib.request.urlopen(req2) as r2:
        sc = json.loads(r2.read())
    print(f"  In stripe_customers table: {'YES: ' + sc[0]['stripe_customer_id'] if sc else 'NO'}")
