# Infrastructure Cost Research (accessed 2026-10-24)

Published prices in USD per month, before tax, US East unless noted, assuming 730 hours a month. Anthropic usage is excluded (see `docs/ai/cost-model.md`). **Verify again before purchasing.** Prices change, and several items below could not be confirmed.

## App hosting (≈1 vCPU / 1–2 GB)
| Provider | Price | Deploy safety |
|---|---|---|
| **Render** web service | 1 CPU / 2 GB **$25**. 512 MB **$7**. Workspace Hobby $0 or Pro $25. Bandwidth 5 / 25 GB included, then $0.15/GB | Zero-downtime deploys (without persistent disk). Failing health check cancels the deploy. One-click rollback |
| **Fly.io** | shared-cpu-1x 1 GB **$6.70**. performance-1x 2 GB **$33.00**. Egress $0.02/GB (NA/EU), $0.12/GB (India) | Rolling, canary or bluegreen deploys (bluegreen needs a health check) |
| **Railway** | Pro $20 (includes usage credit). $20 per vCPU-month + $10 per GB-month (≈ $40 for 1 vCPU / 2 GB) | Health-check-gated deploys. Rollback within the plan's retention |
| **Google Cloud Run** | $0.000018 per vCPU-second, $0.000002 per GiB-second (instance-based). ≈ **$52.59** always-on for 1 vCPU / 2 GiB | Revisions and traffic splitting. Mumbai is Tier 1 |
| **AWS ECS Fargate** | ≈ **$36.04** (1 vCPU / 2 GB x86). **Load balancer and NAT not included** | ALB health checks, rolling deploys |
| AWS App Runner | **Closed to new customers since 2026-04-30.** Don't use | — |

## Managed PostgreSQL
| Provider | Price | PITR | `CREATE ROLE` for `app_user` | Regions |
|---|---|---|---|---|
| **Render** | 1 GB **$19**. 1 CPU / 2 GB **$40**. 256 MB $6. Storage $0.30/GB | 3 days (Hobby), 7 days (Pro+) | **Not documented: test first** | US, EU (Frankfurt), Singapore. No India |
| **Neon** | $0.106 per CU-hour (Launch). Storage $0.35/GB | 7 days (Launch), 30 days (Scale) | Allowed (no superuser; grant explicitly) | EU, US. No India |
| **Supabase** | Pro from $25 + Small $15 + PITR ≈ $100 (7 days) → ≈ **$130** | Add-on | `postgres` role has admin privileges (no limits stated) | **Mumbai**, EU, US |
| **AWS RDS** | db.t4g.small ≈ **$23.36** (US) / ≈ **$30.66** (Mumbai). Multi-AZ ≈ $47.45 / ≈ $61. gp3 $0.115/GB (US) | Automated backups with PITR | **Yes** (`rds_superuser`, CREATEROLE) | **India**, EU, US |
| **Crunchy Bridge** | Hobby-2 (2 GB) **$35**. Standard-4 $70. Storage $0.10/GB | **10 days included** | Superuser claimed in marketing only (unverified) | AWS, Azure, GCP |
| **Fly Managed Postgres** | Basic $38, Starter $72 | Not documented | Not documented | Not documented |

## Supporting services
| Need | Price |
|---|---|
| **Postmark** | Developer $0 (100 emails/mo). At 10k/mo: Basic $15.00, Pro $16.50, Platform $18.00. Dedicated IP only from 300k/mo. Bounce, spam and delivery webhooks |
| **Sentry** | Developer free (1 user, 5k errors). **Team $29/mo** ($26 billed annually) |
| GlitchTip | Free (1k events). Small $15/mo |
| **Better Stack** | Free: 10 monitors and 1 status page. Responder $34/mo ($29 billed annually) |
| **Cloudflare R2** | $0.015 per GB-month. Free egress. 10 GB free |
| AWS S3 | $0.023 per GB-month. Egress $0.09/GB after 100 GB free |

## Example monthly totals (Render-based, US Virginia; assumptions: under 10k emails, under 25 GB bandwidth)
| Item | Lean | Comfortable |
|---|---|---|
| Render workspace | $0 (Hobby, 3-day PITR) | $25 (Pro, 7-day PITR) |
| Production app | $25 (1 instance) | $50 (2 instances) |
| Production DB | $19 + $3 storage | $40 + $6 storage |
| Staging app + DB | ≈ $13 | ≈ $13 |
| Postmark | $15 | $16.50 |
| Sentry / Better Stack / R2 | $0 (free tiers) | $29 + $34 + $0.60 |
| **Total** | **≈ $75/month** | **≈ $214/month** |

**India data residency:** replace the Render DB with RDS Mumbai (≈ $31 + storage, or ≈ $61 Multi-AZ) or Supabase Mumbai (≈ $130 with PITR), and host on Cloud Run Mumbai (≈ $53 per always-on instance) or ECS Fargate.

## Not verified
- Render `CREATE ROLE` support.
- Fly Postgres PITR, roles and regions.
- Crunchy superuser access and regions.
- AWS load balancer, NAT, Secrets Manager and CloudWatch costs.
- RDS default backup retention.
- Postmark pricing at 50k emails a month.
- Sentry overage rates.
- Render rollback retention per plan.

## Sources
- **Render:** https://render.com/pricing.md · https://render.com/docs/deploys · https://render.com/docs/rollbacks · https://render.com/docs/regions · https://render.com/docs/postgresql-credentials
- **Fly.io:** https://docs.fly.io/about/pricing · https://docs.fly.io/reference/configuration · https://docs.fly.io/mpg/
- **Railway:** https://railway.com/pricing · https://docs.railway.com/reference/deployments
- **Google Cloud Run:** https://cloud.google.com/run/pricing
- **AWS compute:** https://aws.amazon.com/fargate/pricing/ · https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html
- **AWS RDS:**
  - AWS Price List API, AmazonRDS (us-east-1, ap-south-1), via https://pricing.us-east-1.amazonaws.com/
  - https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.Roles.rds_superuser.html
- **Neon:** https://neon.com/pricing · https://neon.com/docs/manage/roles
- **Supabase:** https://supabase.com/pricing · https://supabase.com/docs/guides/platform/backups · https://supabase.com/docs/guides/database/postgres/roles
- **Crunchy Bridge:** https://www.crunchydata.com/pricing · https://docs.crunchybridge.com/concepts/backups
- **Postmark:** https://postmarkapp.com/pricing · https://postmarkapp.com/developer/webhooks/webhooks-overview
- **Error tracking:** https://sentry.io/pricing/ · https://glitchtip.com/pricing
- **Uptime and status page:** https://betterstack.com/pricing
- **Object storage:** https://developers.cloudflare.com/r2/pricing/ · https://aws.amazon.com/s3/pricing/
