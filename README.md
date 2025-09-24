# Twitch Clips Consent API
This is a simple API to allow clip players to gain access to mp4 urls by acting as a middleman for the [Get Clips Download](https://dev.twitch.tv/docs/api/reference/#get-clips-download) API.

## Deploying

### Cloudflare Workers

At the time of writing, the button below will prompt you for everything required to deploy this API to Cloudflare Workers except for the subdomain to assign the worker to and the `CLIENT_SECRET` variable, which must be added as a secret to your worker, not as a standard environment variable. You should use the same client id and secret as the clip player that will be using this api.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fsugoidogo%2Ftwitch-clips-consent-api)

### Docker

This worker is also availible as a docker container at [ghcr.io/sugoidogo/twitch-clips-consent-api](https://github.com/sugoidogo/twitch-clips-consent-api/pkgs/container/twitch-clips-consent-api).
It listens on HTTP port 8080 and requires the `CLIENT_ID` and `CLIENT_SECRET` environment variables to match those of the client that will be using this API.
It also requires mounts for `/worker/cache`, `/worker/kv`, `/worker/d1`, and `/worker/r2`. 
The r2 mount is the only one actually used, but the selflare runtime requires all of them regardless.

<details><summary>docker-compose.yml</summary>

```yaml
services:
    twitch-clips-consent-api:
        image: ghcr.io/sugoidogo/twitch-clips-consent-api
        volumes:
            - ./.storage/cache:/worker/cache
            - ./.storage/kv:/worker/kv
            - ./.storage/d1:/worker/d1
            - ./.storage/r2:/worker/r2
        ports:
            - "8080:8080"
        environment:
            - CLIENT_ID=CHANGEME
            - CLIENT_SECRET=HIDEME
```

</details>

## Usage

### `/consent`
Before requesting a clip download, the broadcaster must authorize your client to download their clips, which is done via the `/consent` endpoint. For example, Clippy (the clip player this was developed for) will send a chat message with the link https://clippy.sugoidogo.com/consent, which then redirects the broadcaster to a page like the following:

<details><summary>Image</summary>
<img src='auth-example.png'>
</details>

Once they click Authorize, they are redirected back to the `/consent` endpoint with an authorization code, which this API consumes and exchanges for a refresh token that is stored server-side for future requests, and a message is shown to the user informing them that they can leave the page. You will need to add the consent endpoint url to your OAuth redirect urls in the [Twitch Developer Console](https://dev.twitch.tv/console).

### `/clip`

This endpoint requires the same Authorization header as the official Twitch API, with an access token matching the client ID this API was deployed with. It takes two query parameters:

`broadcaster_id`: the id of the broadcaster who owns the clip you want to download

`clip_id`: the id of the clip you want to download, can be provided multiple times

A typical request could look like this: `/clip?broadcaster_id=123456&clip_id=YourMomStinks-asdfghjkl`

If the broadcaster hasn't previously authorized this client, you'll get a response like this:

```json
{
    "auth_uri":"https://clippy.sugoidogo.com/consent",
    "error":"missing broadcaster authorization"
}
```

Otherwise, the request is passed to the Twitch API and the response is the same as the [Get Clips Download](https://dev.twitch.tv/docs/api/reference/#get-clips-download) endpoint.