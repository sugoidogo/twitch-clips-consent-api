interface R2orKV {
	get(key: string): Promise<R2ObjectBody | null | string>
	put(key: string, value: string): Promise<R2Object | null | void>
}
interface Env {
	CLIENT_ID: string;
	CLIENT_SECRET: string;
	tokens: R2orKV;
}
interface TwitchValidation {
	client_id: string,
	login: string,
	scopes: string[],
	user_id: string,
	expires_in: number,
	access_token: string
}
interface TwitchTokens {
	access_token: string,
	refresh_token: string,
	expires_in: number,
	scope: string,
	token_type: string
}

import { GetClipsParams, GetClipsResponse, GetUsersResponse } from "ts-twitch-api"

export default {
	async fetch(request, env): Promise<Response> {
		try {
			const responseHeaders = new Headers()
			responseHeaders.append('Access-Control-Allow-Origin', '*')
			responseHeaders.append('Access-Control-Allow-Headers', '*')

			function newResponse(body?: BodyInit | null, init?: ResponseInit): Response {
				if (!init) {
					init = {}
				}
				init.headers = responseHeaders
				return new Response(body, init)
			}

			async function wrap_response(response: Response): Promise<Response> {
				response.headers.forEach((value, key) => {
					responseHeaders.append(key, value)
				})
				if (!response.ok) {
					return newResponse(JSON.stringify({
						'endpoint': response.url,
						'response': await response.text()
					}), {
						status: response.status,
						statusText: response.statusText
					})
				}
				return newResponse(response.body, {
					status: response.status,
					statusText: response.statusText
				})
			}

			function error_response(status: number, statusText: string, body?: any): Response {
				if (!body) {
					body = statusText
				} else if (typeof body !== "string") {
					body = JSON.stringify(body)
					responseHeaders.append('content-type', 'application/json')
				}
				return newResponse(body, {
					status: status,
					statusText: statusText
				})
			}

			function broadcaster_id_unauthorized_response(): Response {
				return error_response(403, 'unauthorized broadcaster_id', {
					'auth_uri': get_auth_uri(),
					'error': 'missing broadcaster authorization'
				})
			}

			function get_request_headers(access_token: string): Headers {
				const requestHeaders = new Headers()
				requestHeaders.append('Authorization', 'Bearer ' + access_token)
				requestHeaders.append('Client-Id', env.CLIENT_ID)
				return requestHeaders
			}

			if (request.method == 'OPTIONS') {
				return newResponse()
			}
			if (!['GET', 'PUT', 'POST', 'HEAD'].includes(request.method)) {
				return error_response(501, 'invalid request method')
			}
			const url = new URL(request.url);
			const query = url.searchParams

			function get_redirect_uri(): string {
				const redirect_uri = new URL(url)
				redirect_uri.protocol = 'https'
				redirect_uri.search = ''
				redirect_uri.pathname = '/consent'
				return redirect_uri.href
			}

			function get_auth_uri(): string {
				const auth_uri = new URL('https://id.twitch.tv/oauth2/authorize')
				auth_uri.searchParams.append('client_id', env.CLIENT_ID)
				auth_uri.searchParams.append('response_type', 'code')
				auth_uri.searchParams.append('scope', 'channel:manage:clips')
				auth_uri.searchParams.append('redirect_uri', get_redirect_uri())
				return auth_uri.href
			}

			async function get_validation(): Promise<TwitchValidation> {
				const authorization = request.headers.get('authorization')
				if (!authorization) {
					throw error_response(401, 'missing authorization header')
				}
				const validationHeaders = new Headers()
				validationHeaders.append('authorization', authorization)
				const validationResponse = await fetch('https://id.twitch.tv/oauth2/validate', { headers: validationHeaders })
				if (validationResponse.status != 200) {
					throw wrap_response(validationResponse)
				}
				const validation: TwitchValidation = await validationResponse.json()
				if (validation.client_id !== env.CLIENT_ID) {
					throw error_response(403, 'unauthorized client_id')
				}
				validation.access_token = authorization.substring(6).trim()
				return validation
			}

			async function getClips(access_token: string, params: GetClipsParams) {
				const request_url = new URL('https://api.twitch.tv/helix/clips')
				let key: keyof typeof params
				for (key in params) {
					request_url.searchParams.append(key, String(params[key]))
				}
				console.log(request_url.href)
				const request_headers = get_request_headers(access_token)
				return fetch(request_url, { headers: request_headers })
			}

			if (url.pathname === '/consent') {
				const error_name = query.get('error')
				if (error_name) {
					const error_description = query.get('error_description') || 'no description provided'
					return error_response(401, error_name + ': ' + error_description)
				}
				const code = query.get('code')
				if (!code) {
					responseHeaders.append('Location', get_auth_uri())
					return error_response(307, 'redirecting to twitch')
				}
				const body = new FormData()
				body.append('client_id', env.CLIENT_ID)
				body.append('client_secret', env.CLIENT_SECRET)
				body.append('code', code)
				body.append('grant_type', 'authorization_code')
				body.append('redirect_uri', get_redirect_uri())
				let response = await fetch('https://id.twitch.tv/oauth2/token', {
					'method': 'POST',
					'body': body,
				})
				if (response.status != 200) {
					return wrap_response(response)
				}
				const tokens: TwitchTokens = await response.json()
				console.log(tokens)
				const access_token = tokens.access_token
				response = await fetch('https://api.twitch.tv/helix/users', { headers: get_request_headers(access_token) })
				if (response.status != 200) {
					return wrap_response(response)
				}
				const users: GetUsersResponse = await response.json()
				const refresh_token = tokens.refresh_token
				await env.tokens.put(users.data[0].id, refresh_token)
				const redirect_url = '/preferences.html?access_token=' + tokens.access_token
					+ '&client_id=' + env.CLIENT_ID
				responseHeaders.append('Location', redirect_url)
				return newResponse(null, { status: 302 })
			}
			if (url.pathname === '/consent/parameters') {
				const validation = await get_validation()
				const user_id = validation.user_id
				switch (request.method) {
					case 'PUT':
					case 'POST': {
						let parameters = url.search
						if (parameters[0] === '?') {
							parameters = '&' + parameters.substring(1)
						}
						const params: GetClipsParams = Object.fromEntries(url.searchParams.entries())
						params.broadcaster_id = validation.user_id
						const response = await getClips(validation.access_token, params)
						if (!response.ok) {
							return wrap_response(response)
						}
						const clips: GetClipsResponse = await response.json()
						await env.tokens.put(user_id + '_parameters', parameters)
						if (clips.data.length === 0) {
							return newResponse('Settings saved, but no allowed clips found')
						}
						return newResponse('Settings saved')
					}
					case 'GET': {
						let parameters = await env.tokens.get(user_id + '_parameters')
						if (!parameters) {
							return error_response(404, 'no parameters registered')
						}
						if (typeof parameters !== 'string') {
							parameters = await parameters.text()
						}
						return newResponse(parameters)
					}
				}
			}
			if (url.pathname === '/clips') {
				const validation = await get_validation()
				const broadcaster_id = query.get('broadcaster_id')
				if (!broadcaster_id) {
					return error_response(400, 'missing broadcaster_id query parameter')
				}
				let authorization = await env.tokens.get(broadcaster_id)
				if (!authorization) {
					return broadcaster_id_unauthorized_response()
				}
				let parameters = await env.tokens.get(broadcaster_id + '_parameters')
				if (!parameters) {
					parameters = ''
				} else if (typeof parameters !== 'string') {
					parameters = await parameters.text()
				}
				if (parameters.includes('&id=')) {
					parameters = url.search.replaceAll('broadcaster_id=' + broadcaster_id, '')
					parameters = parameters.replace('?&', '?')
				} else {
					parameters = url.search + parameters
				}
				const params = Object.fromEntries(new URLSearchParams(parameters).entries())
				const response = await getClips(validation.access_token, params)
				return wrap_response(response)
			}
			if (['/clips/downloads', '/clip'].includes(url.pathname)) {
				const validation = await get_validation()
				const broadcaster_id = query.get('broadcaster_id')
				if (!broadcaster_id) {
					return error_response(400, 'missing broadcaster_id query parameter')
				}
				let refresh_token = await env.tokens.get(broadcaster_id)
				if (!refresh_token) {
					return broadcaster_id_unauthorized_response()
				}
				if (typeof refresh_token !== 'string') {
					refresh_token = await refresh_token.text()
				}
				if (!query.has('clip_id')) {
					return error_response(400, 'missing clip_id query parameter')
				}
				let parameters = await env.tokens.get(broadcaster_id + '_parameters')
				if (parameters) {
					if (typeof parameters !== 'string') {
						parameters = await parameters.text()
					}
					const params: GetClipsParams = Object.fromEntries(new URLSearchParams(parameters).entries())
					params.id = query.getAll('clip_id')
					const response = await getClips(validation.access_token, params)
					if (!response.ok) {
						return wrap_response(response)
					}
					const clips: GetClipsResponse = await response.json()
					if (clips.data.length === 0) {
						return error_response(403, 'requested clip(s) fail consent parameters')
					}
					query.delete('clip_id')
					for (const clip of clips.data) {
						query.append('clip_id', clip.id)
					}
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
					return wrap_response(response)
				}
				const tokens: TwitchTokens = await response.json()
				const access_token = tokens.access_token
				const request_url = new URL('https://api.twitch.tv/helix/clips/downloads')
				query.append('editor_id', broadcaster_id)
				request_url.search = query.toString()
				response = await fetch(request_url, { headers: get_request_headers(access_token) })
				return wrap_response(response)
			}
			return error_response(400, 'invalid request path')
		} catch (error) {
			if (error instanceof Response) {
				return error
			} else {
				throw error
			}
		}
	},
} satisfies ExportedHandler<Env>;
