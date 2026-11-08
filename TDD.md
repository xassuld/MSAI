# MSAI Website Technical Design Document

## 1. Overview

The MSAI website is a public event and community site for the Mongolian Students'
Association in Italy. It provides:

- A public landing page with community links.
- A public Christmas event page.
- Event registration with email ticket delivery.
- Calendar-based Early Bird, Regular, and Late ticket tiers.
- An authenticated admin page for event content and ticket reporting.

Ticket payments use Stripe Checkout. A ticket is created only after Stripe
confirms a successful card payment through the webhook.

## 2. Goals

1. Make the public event information easy to find and update.
2. Keep event editing available to a non-technical organizer.
3. Assign the ticket tier based on the Italy calendar date at registration time.
4. Send a paid ticket email only after Stripe confirms payment.
5. Prevent duplicate recipient counts for repeated registrations using the same email.
6. Give administrators visibility into recipients, ticket type, and send date.
7. Keep credentials and database access on the backend only.

## 3. Non-goals

- Payment refunds or payment reconciliation.
- Ticket scanning is limited to the authenticated admin check-in endpoint.
- Multiple event types or a general event management platform.
- Public access to recipient information.

## 4. Architecture

```text
Browser
  |
  v
Next.js frontend (fd/)
  |  public event pages, RSVP form, admin UI
  |
  v
Express backend (bd/)
  |  API validation, sessions, rate limits, email delivery
  |
  +--> MongoDB       event, ticket, and rate-limit data
  +--> Stripe       card checkout and payment confirmation
  +--> Gmail API    admission ticket email
  +--> Cloudinary    signed event poster uploads
```

The frontend is deployed on Vercel. The backend is deployed as a Render web
service. Admin API calls are proxied through the frontend origin so the browser
can retain the admin session cookie.

## 5. Frontend design

### Routes

- `/` — public community landing page.
- `/events/christmas` — public event details, pricing, and registration.
- `/admin` — authenticated event editor and ticket count.
- `/admin/tickets` — authenticated recipient and ticket-tier report.

### Loading and error states

The app uses an application-level loading screen for slow page loads and a
specific event loading screen for the backend-dependent event route. Backend
errors are surfaced as visible error states rather than being silently replaced
with successful-looking content.

### Public event page

The event page displays:

- Event title, description, date, time, location, and poster.
- Party inclusions.
- A prominent online card-payment notice.
- Early Bird, Regular, and Late prices with date ranges.
- The currently active tier based on the Europe/Rome date.
- The registration form.

The form collects name, email, and consent, then redirects the attendee to
Stripe Checkout. The browser success page is informational; the webhook is the
source of truth for ticket creation.

## 6. Backend design

### Event API

- `GET /api/events/christmas` returns the public event configuration.
- `GET /api/health` is used by deployment health checks.

### Checkout API

- `POST /api/events/christmas/checkout`
- Validates name, email, consent, request origin, and rate limits.
- Resolves the active tier using `Europe/Rome`.
- Rejects checkout when sales are closed or capacity is reached.
- Creates a 30-minute Stripe Checkout session for the active tier.

### Stripe webhook

- `POST /api/webhooks/stripe`
- Verifies the raw request with `STRIPE_WEBHOOK_SECRET`.
- Handles paid `checkout.session.completed` events.
- Creates the Mongoose ticket and increments `events.soldCount` in one
  transaction.
- Is idempotent by `stripeSessionId` and retries email delivery when needed.

### Gate validation API

- `POST /api/admin/tickets/check-in`
- Requires an authenticated admin session.
- Validates a paid ticket code and prevents duplicate scans.

### Admin API

- `POST /api/admin/login` — create an admin session.
- `POST /api/admin/logout` — destroy the admin session.
- `GET /api/admin/events/christmas` — load event configuration.
- `PUT /api/admin/events/christmas` — validate and save event configuration.
- `POST /api/admin/upload-signature` — create a Cloudinary upload signature.
- `GET /api/admin/tickets/stats` — return the unique sent-ticket count.
- `GET /api/admin/tickets` — return recipient name, email, tier, and send date.
- `DELETE /api/admin/tickets` — permanently clear ticket records.

All admin endpoints require an authenticated iron-session cookie. Mutating
endpoints also require an allowed request origin.

## 7. Data model

### Event document

Collection: `events`

```ts
{
  _id: "christmas",
  title: string,
  description: string,
  date: string,
  time: string,
  location: string,
  posterUrl: string,
  ticketInfo: string,
  partyDescription: string,
  cashAtGateText: string,
  ticketPricing: {
    earlyBird: { price: number, startsAt: "YYYY-MM-DD", endsAt: "YYYY-MM-DD" },
    regular: { price: number, startsAt: "YYYY-MM-DD", endsAt: "YYYY-MM-DD" },
    late: { price: number, startsAt: "YYYY-MM-DD", endsAt: "YYYY-MM-DD" }
  },
  updatedAt: Date
}
```

### Admission ticket document

Collection: `christmas_admission_tickets`

```ts
{
  _id: ObjectId,
  name: string,
  email: string,             // normalized recipient
  ticketCode: string,        // unique 8-character code
  ticketTier: "earlyBird" | "regular" | "late",
  amountPaidCents: number,
  currency: "eur",
  stripeSessionId: string,   // unique idempotency key
  stripePaymentIntentId?: string,
  isPaid: boolean,
  emailSentAt?: Date,
  isCheckedIn: boolean,
  checkedInAt?: Date,
  createdAt: Date
}
```

The admin report counts unique paid recipient emails and displays the ticket
tier and email timestamp. Ticket codes are scanned once at the gate.

## 8. Ticket tier rules

The backend is authoritative for tier assignment. The frontend only displays
the current tier for user guidance.

Default configuration:

| Tier | Dates | Online price |
|---|---|---:|
| Early Bird | 2026-11-09 through 2026-11-15 | €18.00 |
| Regular | 2026-11-16 through 2026-12-06 | €22.00 |
| Late | 2026-12-07 through 2026-12-13 | €27.00 |

Dates are interpreted in `Europe/Rome` and are inclusive. If no tier includes
the current date, registration is rejected.

## 9. Email design

After a successful payment, the Gmail API email includes:

- Attendee name.
- Ticket code.
- Ticket type.
- Amount paid.
- Event date, time, and location.
- Party inclusions.
- Online card-payment notice.
- Event page link and QR code.

If email delivery fails, the paid ticket remains stored and a repeated Stripe
webhook delivery retries the email.

## 10. Security and privacy

- Backend secrets stay in backend environment variables.
- Admin passwords are checked using a timing-safe hash comparison.
- Admin sessions use HTTP-only, secure production cookies.
- Admin APIs require authentication.
- Recipient data is never exposed through public endpoints.
- Registration and login attempts are rate limited.
- User-controlled event text is validated and email HTML is escaped.
- Poster URLs are restricted to HTTPS Cloudinary URLs.
- Recipient records can be permanently deleted from the admin page.

## 11. Validation and testing strategy

### Automated checks

Run from the repository root:

```bash
npm run lint
npm run typecheck
npm run build
```

### Required behavior checks

1. A registration during each tier stores and emails the correct tier.
2. A registration outside all tier dates is rejected.
3. A repeated registration with the same email remains one admin recipient.
4. A successful email sets `emailSentAt`.
5. A failed email does not count as sent.
6. Admin recipients display the correct tier colors:
   - Green — Early Bird
   - Yellow — Regular
   - Red — Late
7. Unauthenticated users cannot read or delete recipient records.
8. Clearing tickets requires explicit confirmation and resets the count.
9. Public pages never display recipient names or email addresses.
10. Slow backend startup displays a loading state instead of a blank page.

## 12. Deployment and operations

Required backend environment variables include MongoDB, Gmail OAuth,
Cloudinary, admin session, admin password, frontend origins, and proxy
configuration. The backend health check is `/api/health`.

After deployment:

1. Verify the backend health endpoint.
2. Open the public event page.
3. Sign in at `/admin`.
4. Save an event change and confirm it appears publicly.
5. Confirm each ticket tier is configured correctly.
6. Submit a test checkout during an active tier using Stripe test mode.
7. Forward `checkout.session.completed` with the Stripe CLI and confirm the
   email contains the tier, amount, ticket code, and QR code.
8. Confirm the recipient appears in `/admin/tickets`.
9. Sign out and verify recipient data is inaccessible.

## 13. Payment operations

Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `FRONTEND_URL` in
the backend environment. Use Stripe test mode during development and forward
events to `/api/webhooks/stripe` with the Stripe CLI. MongoDB must support
transactions (Atlas or a replica set) because paid-ticket creation and the
capacity increment are atomic. Refunds and reconciliation remain operational
follow-up work.
