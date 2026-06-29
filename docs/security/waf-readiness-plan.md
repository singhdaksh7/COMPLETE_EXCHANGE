# WAF Readiness Plan (Stage 6)

**Status: PLAN — staging/demo (INR_ONLY). No WAF is created by reading this.**
For cybersecurity audit + FIU technical readiness. Any provisioning uses
`scripts/security/plan-waf-readiness.ps1`, which is **dry-run by default** and
requires explicit `-Apply` (+ confirmation flags).

---

## 0. Critical scoping note (read first)

Read-only evidence (`collect-edge-security-evidence.ps1`) shows:

- CloudFront `E36DO8GL4SA61N` is **Deployed**, has aliases `exorain.com` +
  `www.exorain.com` (ACM cert), and fronts **two origins**: the staging **ALB**
  (the API) and the **S3 frontend** bucket (path-based behaviors).
- **A WAF WebACL is ALREADY associated** with the distribution — an auto-created
  `CreatedByCloudFront-*` ACL (created via the CloudFront console "security
  protections"). So the gap is **not** "no WAF"; it is "the associated ACL is the
  default auto-created one, not a reviewed/tuned ruleset with the managed groups
  + rate rules below, and its rules/mode/false-positive posture are unverified."
- **DNS divergence:** live `www.exorain.com` currently resolves to **Vercel**,
  even though CloudFront is configured for the same alias. AWS WAF on CloudFront
  only protects traffic that actually traverses CloudFront; Vercel-served `www`
  traffic needs **Vercel Firewall** instead.

**First actions:** (1) decide the intended edge for `exorain.com`/`www` and align
DNS; (2) inspect the existing `CreatedByCloudFront-*` WebACL and decide whether to
augment it or replace it with the tuned ruleset below.

WAF for CloudFront is **global**: a WebACL is created with `--scope CLOUDFRONT`
in **us-east-1**, then associated with the distribution.

## 1. Managed rule groups to consider (monitor/count first)

| Rule group | Purpose | Start mode |
|---|---|---|
| `AWSManagedRulesCommonRuleSet` | OWASP-style common protections (XSS, LFI, size, etc.) | **Count** |
| `AWSManagedRulesKnownBadInputsRuleSet` | Known exploit/bad request patterns | **Count** |
| `AWSManagedRulesAmazonIpReputationList` | Amazon threat-intel IP reputation | Count → Block |
| `AWSManagedRulesSQLiRuleSet` | SQL injection patterns | **Count** |
| `AWSManagedRulesAnonymousIpList` (optional) | VPN/Tor/hosting-provider anonymizing IPs | **Count** (high FP risk) |

> Start **every** managed group in **Count** (monitor) mode, review CloudWatch
> WAF metrics + sampled requests for false positives, then flip to Block
> group-by-group. `CommonRuleSet` + `SQLi` can false-positive on legitimate
> JSON/base64 bodies (KYC uploads, signatures) — tune `SizeRestrictions_BODY`
> and exclude specific rules before blocking.

## 2. Rate-based rule ideas (per source IP, 5-min window)

| Target | Match | Suggested limit (tune) | Action |
|---|---|---|---|
| Admin login | path starts `/admin/v1` + login path | low (e.g. 100) | Count → Block |
| Auth login/OTP | path `/api/v1/auth/*` | moderate (e.g. 300) | Count → Block |
| KYC upload | path `/api/v1/kyc/*` (POST) | low-moderate | Count |
| Withdrawal creation | path `/api/v1/*withdrawal*` (POST) | low | Count |
| Generic API scanning | high 404 / high request volume | high (e.g. 2000) | Count → Block |

> The app **already** enforces Redis-backed rate limits (`globalRateLimiter`,
> `authRateLimiter`, `sensitiveRateLimiter`, `adminSensitiveRateLimiter`) and
> brute-force lockouts. WAF rate rules are an **additional edge layer**, not a
> replacement — keep limits looser than the app's so WAF catches volumetric
> abuse without double-penalizing normal users.

## 3. Admin-specific protections

- **Path-based rules** for `/admin` and `/admin/v1`: stricter rate limit; option
  to require an **IP allowlist** (WAF IP set) at the edge in addition to the
  app's per-admin allowlist (`middleware/admin-authenticate.ts`).
- **Stricter admin-login rate** than user auth (admins are few, fixed IPs).
- **Optional edge IP allowlist** WebACL rule: allow only office/VPN egress IPs to
  `/admin/v1`, block the rest at the edge (defense-in-depth over the app check).
- **Future:** VPN / bastion / Zero-Trust ingress for the admin panel (out of
  scope this stage; tracked as hardening).

## 4. False-positive risk & monitor-first

- Default action of the WebACL stays **Allow**; rules start in **Count**.
- Bake for a representative period; review `aws wafv2 get-sampled-requests` and
  the per-rule `CountedRequests` CloudWatch metric.
- Flip one rule group at a time to Block; watch 4xx rates and the app's own
  error alarms (`docs/security/cloudwatch-alarms-plan.md`).

## 5. What NOT to block during the staging demo

- Auditor / tester source IPs (allowlist them first).
- Mobile app / server-to-server callers that send **no Origin** header.
- Legitimate KYC document uploads (PDF/JPEG/PNG up to `KYC_MAX_UPLOAD_BYTES`) —
  do not let `SizeRestrictions_BODY` or generic body rules block them.
- Razorpay / KYC provider webhooks (if they traverse this edge) — allow their
  documented source ranges.
- Do not enable aggressive `AnonymousIpList` blocking during the demo (testers
  may use VPNs).

## 6. Rollback plan

- WAF is non-destructive and reversible:
  - Disassociate the WebACL from the distribution:
    `aws wafv2 disassociate-web-acl --resource-arn <cloudfront-arn> --region us-east-1`
  - Or flip the offending rule/group back to **Count**, or set rule action to
    Allow, via `update-web-acl`.
  - Delete the WebACL only after disassociation (`delete-web-acl`).
- Because rules start in Count and default action is Allow, a misconfiguration
  cannot hard-block legitimate traffic before you intentionally flip to Block.

## 7. Evidence commands (read-only)

```bash
# Any WebACL associated with the CloudFront distribution? (CLOUDFRONT scope = us-east-1)
aws wafv2 list-web-acls --scope CLOUDFRONT --region us-east-1 \
  --query 'WebACLs[].{name:Name,id:Id}' --output table
aws wafv2 get-web-acl-for-resource \
  --resource-arn arn:aws:cloudfront::<ACCOUNT_ID>:distribution/E36DO8GL4SA61N \
  --region us-east-1 2>/dev/null || echo "no WebACL associated"
# Distribution config (does it reference a WebACLId?):
aws cloudfront get-distribution-config --id E36DO8GL4SA61N \
  --query 'DistributionConfig.WebACLId' --output text
```

## 8. Cost note

AWS WAF bills per WebACL (~USD/month), per rule, and per million requests, plus
managed rule-group fees. This is a **paid** resource — do not create it for the
staging demo unless explicitly approved. The plan script defaults to dry-run.

---

**Do not create WAF resources from this doc.** Use
`scripts/security/plan-waf-readiness.ps1` (dry-run by default; `-Apply` +
confirmation required, and it never associates to CloudFront unless explicitly
asked).
