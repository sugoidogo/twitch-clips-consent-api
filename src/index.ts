interface R2orKV {
    get(key: string): Promise<R2ObjectBody|null|string>
    put(key: string, value: string): Promise<R2Object|null|void>
}
interface Env {
    CLIENT_ID: string;
    CLIENT_SECRET: string;
    tokens: R2orKV
}
interface JSONObject {
    [index: string]: string | JSONObject | JSONObject[]
}

export default {
	async fetch(request, env): Promise<Response> {
		const responseHeaders = new Headers()
		responseHeaders.append('Access-Control-Allow-Origin', '*')
		responseHeaders.append('Access-Control-Allow-Headers', '*')
		if (request.method=='OPTIONS'){
			return new Response(null,{headers:responseHeaders})
		}
		const url = new URL(request.url);
		const query = url.searchParams
		switch (url.pathname) {
			case '/consent': {
				if (query.has('error')) {
					return new Response(query.get('error'), {
						status: 401,
						statusText: query.get('error_description') || undefined,
						headers: responseHeaders
					})
				}
				if (!query.has('code')) {
					let redirect_uri = new URL(url)
					redirect_uri.search = ''
					redirect_uri.protocol = 'https'
					const auth_uri = new URL('https://id.twitch.tv/oauth2/authorize')
					auth_uri.searchParams.append('client_id', env.CLIENT_ID)
					auth_uri.searchParams.append('response_type', 'code')
					auth_uri.searchParams.append('scope', 'channel:manage:clips')
					responseHeaders.append('Location', auth_uri.href + '&redirect_uri=' + redirect_uri.href)
					return new Response(null, { status: 307, headers: responseHeaders })
				}
				const code = query.get('code')!
				const redirect_uri = new URL(url)
				redirect_uri.search = ''
				redirect_uri.protocol = 'https'
				const body = new FormData()
				body.append('client_id', env.CLIENT_ID)
				body.append('client_secret', env.CLIENT_SECRET)
				body.append('code', code)
				body.append('grant_type', 'authorization_code')
				body.append('redirect_uri', redirect_uri.href)
				let response = await fetch('https://id.twitch.tv/oauth2/token', {
					'method': 'POST',
					'body': body,
				})
				if (response.status != 200) {
					return new Response(response.body, { status: response.status, headers: responseHeaders })
				}
				const tokens: JSONObject = await response.json()
				const access_token = tokens['access_token']
				const requestHeaders = new Headers()
				requestHeaders.append('Authorization', 'Bearer ' + access_token)
				requestHeaders.append('Client-Id', env.CLIENT_ID)
				response = await fetch('https://api.twitch.tv/helix/users', { headers: requestHeaders })
				if (response.status != 200) {
					return new Response(response.body, { status: response.status, headers: responseHeaders })
				}
				const users: JSONObject = await response.json()
				const refresh_token = tokens['refresh_token']
				if(typeof refresh_token !== 'string'){
					return new Response(null,{status:500})
				}
				await env.tokens.put(users['data'][0]['id'], refresh_token)
				return new Response('clips consent granted, you can close this page', { headers: responseHeaders })
			}
			case '/clip': {
				const authorization = request.headers.get('authorization')
				if (!authorization) {
					return new Response('missing authorization header', { status: 400, headers: responseHeaders })
				}
				const validationHeaders = new Headers()
				validationHeaders.append('authorization', authorization)
				const validationResponse = await fetch('https://id.twitch.tv/oauth2/validate', { headers: validationHeaders })
				if (validationResponse.status != 200) {
					return new Response(validationResponse.body, {
						status: validationResponse.status,
						headers: responseHeaders
					})
				}
				const validation: JSONObject = await validationResponse.json()
				if (validation['client_id'] !== env.CLIENT_ID) {
					return new Response(null, { status: 403, headers: responseHeaders })
				}
				if (!query.has('broadcaster_id')) {
					return new Response('missing broadcaster_id', { status: 400, headers: responseHeaders })
				}
				const broadcaster_id = query.get('broadcaster_id')!
				let refresh_token = await env.tokens.get(broadcaster_id)
				if (!refresh_token) {
					const auth_uri = new URL(url)
					auth_uri.protocol = 'https'
					auth_uri.search = ''
					auth_uri.pathname = 'consent'
					responseHeaders.append('content-type', 'application/json')
					return new Response(JSON.stringify({
						'auth_uri': auth_uri.href,
						'error': 'missing broadcaster authorization'
					}), { status: 403, headers: responseHeaders })
				}
				if (typeof refresh_token !== 'string') {
					refresh_token = await refresh_token.text()
				}
				if (!query.has('clip_id')) {
					return new Response('missing clip_id', { status: 400, statusText: 'missing clip_id', headers: responseHeaders })
				}
				const body = new FormData()
				body.append('client_id', env.CLIENT_ID)
				body.append('client_secret', env.CLIENT_SECRET)
				body.append('grant_type', 'refresh_token')
				body.append('refresh_token', refresh_token)
				let response = await fetch('https://id.twitch.tv/oauth2/token', {
					'method': 'POST',
					'body': body,
				})
				if (response.status != 200) {
					const auth_uri = new URL(url)
					auth_uri.protocol = 'https'
					auth_uri.search = ''
					auth_uri.pathname = 'consent'
					responseHeaders.append('content-type', 'application/json')
					return new Response(JSON.stringify({
						'auth_uri': auth_uri.href,
						'error': 'broadcaster has revoked authorization'
					}), { status: 403, headers: responseHeaders })
				}
				const tokens: JSONObject = await response.json()
				const access_token = tokens['access_token']
				const request_url = new URL('https://api.twitch.tv/helix/clips/downloads')
				request_url.searchParams.append('editor_id', broadcaster_id)
				request_url.searchParams.append('broadcaster_id', broadcaster_id)
				for (const clip_id of query.getAll('clip_id')) {
					request_url.searchParams.append('clip_id', clip_id)
				}
				const requestHeaders = new Headers()
				requestHeaders.append('Authorization', 'Bearer ' + access_token)
				requestHeaders.append('Client-Id', env.CLIENT_ID)
				response = await fetch(request_url, { headers: requestHeaders })
				return new Response(response.body, { status: response.status, headers: responseHeaders })
			}
			default: return new Response(null, { status: 400, headers: responseHeaders })
		}
	},
} satisfies ExportedHandler<Env>;
