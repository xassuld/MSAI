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

The maximum capacity is 120 attendees. The first 100 tickets are sold online;
the final 20 are reserved for cash-only gate sales. Pricing is determined by
online paid-sale order, independently of gate sales:

| Allocation | Tier | Price |
|---|---|---:|
| First 20 online paid sales | Early Bird | Admin-configurable |
| Next 55 online paid sales | Regular | Admin-configurable |
| Next 25 online paid sales | Late | Admin-configurable |
| Up to 20 in-person sales, available anytime | At-gate (cash only) | Admin-configurable |

`events` stores the `christmas` event with `maxCapacity`, total `soldCount`,
`onlineSoldCount`, `gateSaleCount`, `ticketCount`, and tier caps of 20, 55, 25,
and 20. Online checkout increments the online and total paid counts; gate sales
increment the gate and total paid counts. `ticketCount` allocates unique
sequential numbers to all tickets. Checkout creation never reserves a ticket
or increments counts. Online checkout closes at 100 online paid tickets.
Stripe test-mode (`cs_test_`) tickets receive ticket numbers for testing but
never consume paid capacity or appear in the paid sales count. Existing counts
are reconciled to exclude Sandbox tickets during event-state initialization.
Attempts to start checkout after that return HTTP 409.
If more paid sessions complete than remaining spots, the webhook transaction
will reject the excess ticket and refund that payment.

## Ticket fulfillment

`POST /api/events/christmas/checkout` validates name, email, and consent,
normalizes the email, selects the current price from `onlineSoldCount`, and
returns a Stripe Checkout URL. It does not create a ticket.

`POST /api/webhooks/stripe` is registered with `express.raw()` before JSON
parsing. Stripe signature verification is required. On
`checkout.session.completed`, a MongoDB transaction:

1. Checks the unique Stripe session ID for an existing ticket.
2. For live sessions, atomically increments total paid count and online paid
   count only when online sales are below 100 and total attendance is below
   120. Test-mode sessions only increment the ticket number.
3. Creates a paid ticket with a unique eight-character code, sequential ticket
   number, tier, amount, and Stripe identifiers.

If a Checkout session completes with an authorized but uncaptured PaymentIntent,
the backend records the authorization and reserves one online capacity slot.
`payment_intent.succeeded` converts that reservation into a paid ticket;
`payment_intent.canceled` releases it. Pending authorizations are visible to
admins but do not count as paid sales or generate ticket emails.

After commit, Gmail delivers the ticket and an embedded QR code containing the
public online ticket URL, displayed prominently in the admission pass. Scanning
the QR code opens the ticket details page. The public online ticket page also
displays this QR code. Successful delivery sets `emailSentAt`. Failed paid
ticket emails remain retryable through Stripe webhook delivery without creating
a duplicate ticket. MongoDB transactions require Atlas or a replica set.

Admins can issue complimentary tickets from the ticket recipients page. These
do not count toward the 120 paid-ticket capacity, are marked complimentary
rather than paid, and can be checked in. Email delivery failures leave the
ticket intact and can be retried from the admin ticket list.

Cashiers can issue up to 20 At-gate tickets at any time, independent of
online sales. The cashier collects cash and the attendee's name only; the
ticket is created without an email and marked checked in immediately to
authorize entry. The At-gate price is admin-configurable. Gate sales do not
affect online tier pricing or availability.

Admins can update the four ticket prices from the Prices section in the admin
navigation. Prices are stored as integer euro cents and changes apply to new
checkout sessions. Existing Stripe Checkout sessions retain the price shown
when they were created.

The ticket collection is `christmas_admission_tickets`. Provided email
addresses are trimmed/lowercase and indexed; ticket codes and Stripe session
IDs are unique.
Existing non-payment registrations are not considered paid and cannot be used
for entry. The backend drops legacy unique email and `registrationNumber`
indexes when initializing the updated ticket indexes.

## API

- `GET /api/events/christmas` returns event content, `maxCapacity`,
  total `soldCount`, online and At-gate tickets remaining, `isSoldOut`, and the
  active online tier's name, price, and remaining quantity, plus all ticket
  prices in cents.
- Public and admin event endpoints calculate `soldCount` from paid ticket
  recipients, excluding complimentary tickets and Stripe test-mode sessions,
  so the displayed count matches the paid recipients list.
- `PUT /api/admin/ticket-prices` updates all ticket prices in cents and
  requires the existing authenticated iron-session.
- `POST /api/admin/tickets/check-in` requires the existing authenticated
  iron-session, and atomically marks a verified paid or complimentary ticket
  as checked in. Repeat scans return HTTP 409.
- `POST /api/admin/tickets/complimentary` creates and emails a complimentary
  ticket to the supplied attendee name and email without consuming paid-ticket
  capacity.
- `POST /api/admin/tickets/gate` issues a cash-only At-gate ticket by
  attendee name at any time, checks it in immediately, and does not require or
  send email.
- `POST /api/admin/tickets/:ticketNumber/resend` retries email delivery for an
  unsent complimentary ticket.
- Admins can delete any paid, Sandbox, or complimentary ticket, including
  checked-in tickets. Deletion invalidates its code; deleting a paid ticket
  reopens its paid capacity spot without issuing a refund, while deleting a
  complimentary ticket does not affect paid capacity. Ticket numbers are not
  reused after deletion.
- Ticket sales are final and non-refundable. This notice appears on the event
  page, checkout acknowledgment, paid ticket page, and paid ticket email.
- Admin event editing, ticket reporting, and event poster upload remain
  authenticated.

## Security and operations

- Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `FRONTEND_URL`
  only in the backend environment. Set the Stripe webhook destination to
  `/api/webhooks/stripe` and subscribe to `checkout.session.completed`,
  `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, and
  `payment_intent.canceled`.
- Keep MongoDB, Gmail, Stripe, Cloudinary, and admin credentials backend-only.
- Admin mutations require the existing same-origin check and iron-session.
- Verify all three online price bands, the 20 cash gate tickets, successful
  payment and email, webhook retries, duplicate scans, and rejection/refund of
  paid sessions beyond the online allocation in a Stripe test environment.
