FROM jacoblincool/workerd:latest

COPY ./worker.capnp ./worker.capnp

CMD ["serve", "--experimental", "--binary", "worker.capnp"]

LABEL org.opencontainers.image.description Twitch Clips Consent API https://github.com/sugoidogo/twitch-clips-consent-api