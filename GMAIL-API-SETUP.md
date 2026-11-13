# Gmail API ticket email setup

The backend sends tickets from the organization's Gmail account using the Gmail
API over HTTPS. This works with the existing `vercel.app` website address and
does not require a custom email domain. Gmail SMTP and Google App Passwords are
not used.

## Create OAuth credentials

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project.
2. Enable the **Gmail API** for that project.
3. Configure the OAuth consent screen. Add the Gmail account that will send tickets as a test user if the app is in Testing mode.
4. Create an OAuth client ID with application type **Web application**. Add this authorized redirect URI:
   `https://developers.google.com/oauthplayground`
5. Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground), open its settings, enable **Use your own OAuth credentials**, and enter the OAuth client ID and client secret.
6. In Step 1, request this scope:
   `https://www.googleapis.com/auth/gmail.send`
7. Authorize the same Gmail account you plan to use as `GMAIL_USER`.
8. In Step 2, exchange the authorization code for tokens. Copy the refresh token. Keep the client secret and refresh token private.

If the OAuth consent screen stays in **Testing** mode, Google refresh tokens expire after seven days. For ongoing use, publish the consent screen and complete any Google verification Google requires for the Gmail permission.

## Configure Render

In the Render backend service's **Environment** settings, add:

- `GMAIL_USER` — the Gmail address that authorized the Gmail API.
- `GMAIL_CLIENT_ID` — the Google Cloud OAuth client ID.
- `GMAIL_CLIENT_SECRET` — the OAuth client secret.
- `GMAIL_REFRESH_TOKEN` — the OAuth refresh token.

Keep the client secret and refresh token private and backend-only. Remove the old
`GMAIL_APP_PASSWORD`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` variables if set.
Save the environment and deploy the commit that includes Gmail API support.

The sender account must match the Gmail account used to grant consent. Verify
ticket delivery by completing a Stripe test checkout and confirming the
`checkout.session.completed` webhook. Also subscribe the webhook to
`payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, and
`payment_intent.canceled` so unexpected authorization holds can reserve
capacity and be reconciled after capture or cancellation. Check the Render logs
if the Gmail API returns an error.
