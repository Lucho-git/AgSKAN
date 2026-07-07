import urllib.request, json, hmac, hashlib, time

# Get webhook secret from .env
with open("c:/Users/lachl/Repos/AgSKAN/.env") as f:
    env = {}
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k] = v.strip('"').strip("'")

whsec = env.get("PRIVATE_STRIPE_WEBHOOK_SECRET", "")
url = "https://hmxxqacnzxqpcheoeidn.supabase.co/functions/v1/stripe-webhook"

# Simulate invoice.sent events
# Alex: cus_Ufj8vN6R4iGQgl, sub_1TmPdNK3At0l0k1HfTHxb5MX
# Josh: cus_Ufj8WkHOuRX0xQ, sub_1Tm91DK3At0l0k1HRho7C9NL

for name, cus_id, sub_id, email in [
    ("Alex Linto", "cus_Ufj8vN6R4iGQgl", "sub_1TmPdNK3At0l0k1HfTHxb5MX", "lintoag@westnet.com.au"),
    ("Josh McMorran", "cus_Ufj8WkHOuRX0xQ", "sub_1Tm91DK3At0l0k1HRho7C9NL", "mcmorranbros@outlook.com"),
]:
    now = int(time.time())
    event = {
        "id": f"evt_test_{name.lower().replace(' ','_')}_{now}",
        "type": "invoice.sent",
        "data": {
            "object": {
                "id": f"in_test_{name.lower().replace(' ','_')}_{now}",
                "customer": cus_id,
                "subscription": sub_id,
                "customer_email": email,
                "amount_due": 19900,
                "amount_paid": 0,
                "status": "open",
                "billing_reason": "subscription_create",
                "due_date": now + 86400 * 7,
                "hosted_invoice_url": f"https://invoice.stripe.com/test/{name.lower().replace(' ','_')}",
                "currency": "aud",
            }
        }
    }
    
    payload = json.dumps(event).encode()
    
    # Sign with webhook secret
    timestamp = str(now)
    signed_payload = f"{timestamp}.{payload.decode()}"
    sig = hmac.new(whsec.encode(), signed_payload.encode(), hashlib.sha256).hexdigest()
    
    headers = {
        "Content-Type": "application/json",
        "Stripe-Signature": f"t={timestamp},v1={sig}",
    }
    
    print(f"Sending invoice.sent for {name}...")
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            print(f"  Response: {result}")
    except urllib.error.HTTPError as e:
        print(f"  HTTP Error: {e.code} - {e.read().decode()}")
    
    print()
