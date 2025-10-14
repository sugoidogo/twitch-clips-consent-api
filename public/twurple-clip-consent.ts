import type { GetClipsParams, GetClipsResponse } from "ts-twitch-api"
import { AuthProvider } from "@twurple/auth"

export default class ClipConsent {
    authProvider: AuthProvider
    constructor(authProvider: AuthProvider) {
        this.authProvider = authProvider
    }
    getShortConsentURL() {
        return new URL(import.meta.url, '/consent').href
    }
    getLongConsentURL() {
        const auth_uri = new URL('https://id.twitch.tv/oauth2/authorize')
        auth_uri.searchParams.append('client_id', this.authProvider.clientId)
        auth_uri.searchParams.append('response_type', 'code')
        auth_uri.searchParams.append('scope', 'channel:manage:clips')
        return auth_uri.href + 'redirect_uri=' + this.getShortConsentURL()
    }
    async getClipDownloads(broadcaster_id = '0', ...clip_id: string[]) {
        const authorization = await this.authProvider.getAnyAccessToken()
        const requestHeaders = new Headers()
        requestHeaders.append('client-id', this.authProvider.clientId)
        requestHeaders.append('authorization', 'OAuth ' + authorization.accessToken)
        const requestURL = new URL(import.meta.url, '/clip')
        requestURL.searchParams.append('broadcaster_id', broadcaster_id)
        for (const a_clip_id of clip_id) {
            requestURL.searchParams.append('clip_id', a_clip_id)
        }
        const response = await fetch(requestURL, { headers: requestHeaders })
        if (response.status != 200) {
            throw new Error(response.statusText, { cause: response })
        }
        return response.json()
    }
    async getClips(params: GetClipsParams): Promise<GetClipsResponse> {
        const authorization = await this.authProvider.getAnyAccessToken()
        const requestHeaders = new Headers()
        requestHeaders.append('client-id', this.authProvider.clientId)
        requestHeaders.append('authorization', 'OAuth ' + authorization.accessToken)
        const requestURL = new URL(import.meta.url, '/clip')
        let key: keyof typeof params
        for (key in params) {
            requestURL.searchParams.append(key, String(params[key]))
        }
        const response = await fetch(requestURL, { headers: requestHeaders })
        return response.json()
    }
}