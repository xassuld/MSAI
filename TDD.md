# MSAI Christmas Event Technical Design

## Overview

The Christmas event uses online RSVP reservations. No online payment is
processed. Every reservation receives a unique ticket and the attendee pays
the exact cash amount at the gate.

## Architecture

```text
Next.js frontend -> Express backend -> MongoDB
                                      -> Gmail API
                                      -> Cloudinary
```

The backend is authoritative for validation, capacity, ticket allocation, and
check-in. MongoDB stores the event counters and admission tickets.

## Registration tiers

Registration order, not calendar time, determines the tier:

| Registration numbers | Tier | Cash price |
|---|---|---:|
| 1-25 | Early Bird | €18 |
| 26-75 | Regular | €22 |
| 76-120 | Late | €26 |

The venue capacity is 120. Registration beyond 120 returns HTTP 409.

## Mongoose models

The `events` document with `_id: "christmas"` contains `maxCapacity`,
`totalRegistered`, `tierCaps`, and `cashAtGateText`. The
`christmas_admission_tickets` document contains the normalized email, attendee
name, unique eight-character ticket code, sequential registration number,
tier, gate price, consent timestamp, email timestamp, payment status, and
check-in fields.

`totalRegistered` is allocated with an atomic `findOneAndUpdate` guarded by
`totalRegistered < 120`. Ticket creation and the increment run in a MongoDB
transaction, preventing duplicate registration numbers during concurrent
requests.

## API

- `GET /api/events/christmas` returns event content plus `totalRegistered`,
  `maxCapacity`, `isSoldOut`, and the active tier with spots remaining.
- `POST /api/events/christmas/registrations` validates name, email, and
  consent. Existing normalized emails receive their original ticket again
  without consuming capacity. New attendees receive HTTP 201 and a Gmail
  ticket containing a QR code and cash instructions.
- `POST /api/admin/tickets/check-in` requires the existing admin session.
  Ticket codes are atomically marked checked in and paid, and the response
  tells volunteers which cash amount to collect. Repeated scans return HTTP
  409.
- `GET /api/admin/tickets` and `/api/admin/tickets/stats` expose authenticated
  recipient reporting.
- `DELETE /api/admin/tickets` clears tickets and resets the registration
  counter after explicit admin confirmation.

## Public UX

The event page displays the cash-at-the-gate notice, tier prices, live
registration count, remaining spots, and sold-out state. The RSVP form remains
on the site and reports whether a new reservation was made or an existing
ticket email was resent.

## Security

- Admin routes use iron-session authentication and same-origin checks for
  mutations.
- Email addresses are normalized before lookup and storage.
- Ticket codes use cryptographic randomness and are never generated from
  attendee data.
- Gmail, MongoDB, Cloudinary, and admin credentials remain backend-only.
- Registration requests are rate limited by hashed client IP.

## Operations and tests

Set MongoDB, Gmail OAuth, Cloudinary, admin, and frontend-origin variables in
Render. Verify `/api/health`, submit registrations for all three tier ranges,
confirm duplicate email idempotency, test the 121st registration, and test
successful and duplicate check-ins. MongoDB must support transactions through
Atlas or a replica set.
