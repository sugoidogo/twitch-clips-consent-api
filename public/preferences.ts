const status_span = document.querySelector('span')
if (!status_span) {
    throw new Error('failed to find status element, has page layout changed?')
}
globalThis.addEventListener('error', function (event) {
    status_span.innerHTML = String(event)
    throw event.error
})
globalThis.addEventListener('unhandledrejection', function (event) {
    status_span.innerHTML = String(event.reason)
})
import { TwitchApi } from "ts-twitch-api";
const parameters = new URLSearchParams(location.search)
const access_token = parameters.get('access_token')
if (!access_token) {
    throw new Error('missing access_token query parameter')
}
const client_id = parameters.get('client_id')
if (!client_id) {
    throw new Error('missing client_id query parameter')
}
const api_client = new TwitchApi({ accessToken: access_token, clientId: client_id })
const users = await api_client.users.getUsers()
if (!users.ok || !users.data.data[0]) {
    throw new Error('failed to fetch authorising user', { cause: users.data })
}
const user = users.data.data[0]
const header = document.querySelector('h1')
if (!header) {
    throw new Error('failed to find header, has page layout changed?')
}
header.innerHTML += ', ' + user.display_name

const form = document.querySelector('form')
if (!form) {
    throw new Error('failed to find form, has page layout changed?')
}
const headers = new Headers()
headers.append('Authorization', 'OAuth ' + access_token)
headers.append('client-id', client_id)
form.onsubmit = async function (event) {
    event.preventDefault()
    status_span.innerHTML = 'building request...'
    const url = new URL('/consent/parameters', location.origin)
    new FormData(form).forEach((value, key) => {
        if (!value || value instanceof File) {
            return
        }
        if (value === 'on') {
            value = 'true'
        } else {
            value = new Date(value).toISOString()
        }
        url.searchParams.append(key, value)
    })
    status_span.innerHTML = 'submitting settings...'
    const response = await fetch(url, { headers: headers, method: 'POST' })
    const response_text = await response.text()
    status_span.innerHTML = response_text
}
document.querySelectorAll('input').forEach((input) => {
    input.onchange = function () {
        status_span.innerHTML = "Don't forget to save your changes"
    }
})
{
    const response = await fetch(new URL('/consent/parameters', location.origin), { headers: headers })
    if (response.ok) {
        const response_text = await response.text()
        const response_data = new URLSearchParams(response_text)
        response_data.forEach((value, key) => {
            const input: HTMLInputElement | null = document.querySelector('input[name=' + key + ']')
            if (!input) {
                console.warn('Failed to find input element for ' + key)
                return
            }
            if (input.type === 'checkbox') {
                input.checked = true
            } else if (input.type === 'datetime-local') {
                const utcDate = new Date(value)
                const localDate = new Date(utcDate.getTime() - (utcDate.getTimezoneOffset() * 60000))
                input.value = localDate.toISOString().replace(':00.000Z', '')
            }
        })
    }
}
const testButton: HTMLButtonElement = document.querySelector('button')
if (!testButton) {
    throw new Error('Failed to find test button, has layout changed?')
}
testButton.onclick = async function (event) {
    status_span.innerHTML = 'fetching your last 100 clips...'
    let clips = await api_client.clips.getClips({ broadcaster_id: user.id, first: 100 })
    if (!clips.ok) {
        throw new Error('failed to fetch your clips', { cause: clips.data })
    }
    const allClips = clips.data.data
    status_span.innerHTML = 'fetching your last 100 consented clips...'
    let url = new URL('/clips', location.origin)
    url.searchParams.append('broadcaster_id', user.id)
    url.searchParams.append('first', '100')
    let response = await fetch(url, { headers: headers })
    if (!response.ok) {
        throw new Error('failed to fetch allowed clips', { cause: response })
    }
    clips.data = await response.json()
    const allowedClips = clips.data.data.filter((allowedClip) => {
        for (const clip of allClips) {
            if (allowedClip.id === clip.id) {
                return true
            }
        }
        return false
    })
    const deniedClips = allClips.filter((clip) => {
        for (const allowedClip of allowedClips) {
            if (allowedClip.id === clip.id) {
                return false
            }
        }
        return true
    })
    status_span.innerHTML = deniedClips.length + ' of your last ' + allClips.length + ' clips were filtered out'
    if (deniedClips.length === 0) {
        return
    }
    status_span.innerHTML += '... '
    url = new URL('/clips/downloads', location.origin)
    url.searchParams.append('broadcaster_id', user.id)
    let clipCount = 0
    for (const clip of deniedClips) {
        url.searchParams.append('clip_id', clip.id)
        clipCount++
        if (clipCount === 10) {
            break
        }
    }
    response = await fetch(url, { headers: headers })
    if (response.ok) {
        status_span.innerHTML += 'but this server provided downloads for filtered clips anyways. This is a bug, please report it to the developer.'
    } else {
        status_span.innerHTML += 'and this server refused to provide downloads for filtered clips. Everything is working as expected.'
    }
}
status_span.innerHTML = 'You can change your settings below'