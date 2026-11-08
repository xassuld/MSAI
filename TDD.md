# MSAI Christmas Event Ticketing Design

## Overview

The Christmas event sells paid admission tickets through Stripe Checkout. A
ticket is created and emailed only after Stripe confirms payment through a
signature-verified webhook. MongoDB is authoritative for paid ticket count,
capacity, ticket numbers, and check-in.

```text
Next.js frontend -> Express backend -> Stripe Checkout
                                  -> MongoDB
                                  -> Gmail API
                                  -> Cloudinary
```

## Capacity and pricing

The maximum capacity is 120 attendees. Pricing is determined by the sequential
paid ticket number, not a calendar date:

| Ticket numbers | Tier | Price |
|---|---|---:|
| 1-25 | Early Bird | €18 |
| 26-75 | Regular | €22 |
| 76-120 | Late | €26 |

`events` stores the `christmas` event with `maxCapacity`, `soldCount`, and tier
caps of 25, 50, and 45. `soldCount` increments only when a verified paid
Checkout session is fulfilled. Checkout creation never reserves a ticket or
increments the count. Attempts to start checkout when sold out return HTTP 409.
If more paid sessions complete than remaining spots, the webhook transaction
will reject the excess ticket and refund that payment.

## Ticket fulfillment

`POST /api/events/christmas/checkout` validates name, email, and consent,
normalizes the email, selects the current price from `soldCount`, and returns a
Stripe Checkout URL. It does not create a ticket.

`POST /api/webhooks/stripe` is registered with `express.raw()` before JSON
parsing. Stripe signature verification is required. On
`checkout.session.completed`, a MongoDB transaction:

1. Checks the unique Stripe session ID for an existing ticket.
2. Atomically increments `soldCount` only when it is below 120.
3. Creates a paid ticket with a unique eight-character code, sequential ticket
   number, tier, amount, and Stripe identifiers.

After commit, Gmail delivers the ticket and an embedded QR code containing the
ticket code. Successful delivery sets `emailSentAt`. Failed email sends remain
retryable through Stripe webhook delivery without creating a duplicate ticket.
MongoDB transactions require Atlas or a replica set.

The ticket collection is `christmas_admission_tickets`. Email addresses are
trimmed/lowercase and indexed; ticket codes and Stripe session IDs are unique.
Existing non-payment registrations are not considered paid and cannot be used
for entry. The backend drops a legacy unique email index when initializing the
updated ticket indexes.

## API

- `GET /api/events/christmas` returns event content, `maxCapacity`,
  `soldCount`, `isSoldOut`, and the active tier's name, price, and remaining
  quantity.
- `POST /api/admin/tickets/check-in` requires the existing authenticated
  iron-session, and atomically marks a verified paid ticket as checked in.
  Repeat scans return HTTP 409.
- Admin event editing, paid ticket reporting, and event poster upload remain
  authenticated.

## Security and operations

- Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `FRONTEND_URL`
  only in the backend environment. Set the Stripe webhook destination to
  `/api/webhooks/stripe` and subscribe to `checkout.session.completed`.
- Keep MongoDB, Gmail, Stripe, Cloudinary, and admin credentials backend-only.
- Admin mutations require the existing same-origin check and iron-session.
- Verify all three price bands, successful payment and email, webhook retries,
  a duplicate scan, and the 121st paid checkout refund in a Stripe test
  environment before launch.
