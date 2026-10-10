# Open Questions for the Client

Each question has an assumed default, so Phase 1 can start without waiting. Questions marked **must confirm before Phase 3** affect money, permissions or data deletion; for those, the default is used in sandbox only until confirmed.

## The four to confirm before building starts

| # | Question | Assumed default | Lead time |
|---|---|---|---|
| Q1 | **Payment gateway** | Razorpay (UPI, cards, net banking, wallets, refunds). Sandbox until live keys arrive. | KYC typically takes several days to weeks. **Start in Phase 1.** |
| Q2 | **WhatsApp Business API provider** | Meta Cloud API directly or through a BSP of your choice. Until approved: click-to-chat links + email for notifications. | Business verification and template approval take time. **Start in Phase 1.** |
| Q3 | **SMS OTP provider** | Any DLT-registered Indian SMS provider. Until then: email OTP for staff and the fixed OTP in development only. Customer phone login needs this before launch. | DLT entity + template registration. **Start in Phase 1.** |
| Q4 | **Hosting** | AWS Mumbai (`ap-south-1`): containers, managed PostgreSQL, Redis, S3 + CloudFront. | The client's own cloud account is needed for production. |

## Money and policy (must confirm before Phase 3)

| # | Question | Assumed default |
|---|---|---|
| Q5 | GST registration: GSTIN, registered state, legal name and address on invoices | Placeholder in settings; invoices are marked "SAMPLE" until set |
| Q6 | GST rate and HSN per category | 3%; HSN 7113 (jewellery), 7101 (loose pearls) |
| Q7 | Are catalogue prices GST-inclusive? | Yes (see D9) |
| Q8 | Delivery charges | Free above ₹5,000; ₹150 below; per-city override possible |
| Q9 | COD limits | COD allowed up to ₹50,000 order value; off for price-on-request/customized orders |
| Q10 | Return and cancellation window | Cancel any time before Packed; return within 7 days of delivery; customized pieces not returnable |
| Q11 | Referral rewards | Referrer ₹500 and new buyer ₹500, as one-time coupons issued after the first order is delivered |
| Q12 | Customized orders: advance percentage | 50% advance before PO is raised |

## Product and content

| # | Question | Assumed default |
|---|---|---|
| Q13 | AI provider for the Ring Finder | To be chosen by the client; any LLM API can sit behind `AiRanker`. Plain filtered results until one is configured |
| Q14 | Pearl market-rate source | None yet; manual rate table only |
| Q15 | Grades used in the rate table | AAA, AA+, AA, A |
| Q16 | Ring sizes | Indian ring sizes 1–30, with a printable size guide |
| Q17 | Second launch city | Mumbai |
| Q18 | Photography, farm stories, legal page text, FAQ | Provided by the client; Phase 1 uses clearly marked sample content |
| Q19 | Domain, brand logo files, app store developer accounts (Google Play, Apple) | Needed by Phase 5 |
| Q20 | Delivery proof OTP threshold | ₹50,000 |
