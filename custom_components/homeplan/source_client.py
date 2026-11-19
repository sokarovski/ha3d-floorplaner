"""Bounded same-source HTTP transfers; redirects never forward to another destination."""

import asyncio
import hashlib
import os
from collections.abc import Callable
from pathlib import Path
from urllib.parse import quote, urljoin

from aiohttp import ClientError, ClientSession, ClientTimeout

from .const import API_PROTOCOL, MAX_ASSET, MAX_CONFIG, MAX_MANIFEST
from .errors import HomeplanError
from .validation import normalize_url, parse_json, parse_validated, record, text


class SourceClient:
    def __init__(self, session: ClientSession, base: str) -> None:
        self.session = session
        self.base = base

    def url(self, path: str) -> str:
        return urljoin(self.base, "api/" + path)

    async def data(
        self,
        path: str,
        maximum: int = MAX_CONFIG,
        method: str = "GET",
        payload: object = None,
        timeout: ClientTimeout | None = None,
    ) -> bytes:
        try:
            async with self.session.request(
                method,
                self.url(path),
                json=payload if method != "GET" else None,
                allow_redirects=False,
                timeout=timeout or ClientTimeout(total=90, connect=15, sock_read=60),
                headers={"Cache-Control": "no-cache"},
            ) as response:
                if response.status < 200 or response.status >= 300:
                    raise HomeplanError(
                        503,
                        "sourceUnavailable",
                        f"Floor Builder returned HTTP {response.status}; check the saved URL and server.",
                    )
                chunks = bytearray()
                async for chunk in response.content.iter_chunked(131072):
                    chunks.extend(chunk)
                    if len(chunks) > maximum:
                        raise HomeplanError(
                            413, "tooLarge", "A source resource exceeds its byte limit."
                        )
                return bytes(chunks)
        except (ClientError, TimeoutError) as err:
            raise HomeplanError(
                503,
                "sourceUnavailable",
                "Floor Builder is unavailable; existing local data is unchanged.",
            ) from err

    async def json(
        self,
        path: str,
        schema: str | None = None,
        method: str = "GET",
        payload: object = None,
        maximum: int = MAX_CONFIG,
    ) -> dict[str, object]:
        data = await self.data(path, maximum, method, payload)
        # Documents can be tens of MiB; keep parsing/validation off the event loop.
        if schema is None:
            return record(await asyncio.to_thread(parse_json, data))
        return await asyncio.to_thread(parse_validated, schema, data)

    async def download(
        self,
        path: str,
        target: Path,
        expected: dict[str, object],
        progress: Callable[[int], None],
    ) -> None:
        size = expected["byteSize"]
        if not isinstance(size, int) or size > MAX_ASSET:
            raise HomeplanError(
                413, "tooLarge", "An artifact file exceeds the byte limit."
            )
        await asyncio.to_thread(target.parent.mkdir, parents=True, exist_ok=True)
        hasher = hashlib.sha256()
        received = 0
        try:
            async with self.session.get(
                self.url(path),
                allow_redirects=False,
                timeout=ClientTimeout(total=180, connect=15, sock_read=60),
            ) as response:
                if response.status != 200:
                    raise HomeplanError(
                        503,
                        "sourceUnavailable",
                        "An artifact file is unavailable on Floor Builder.",
                    )
                destination = await asyncio.to_thread(target.open, "wb")
                try:
                    async for chunk in response.content.iter_chunked(131072):
                        received += len(chunk)
                        if received > size:
                            raise HomeplanError(
                                413,
                                "tooLarge",
                                "A file exceeds its declared byte size.",
                            )
                        hasher.update(chunk)
                        await asyncio.to_thread(destination.write, chunk)
                        progress(len(chunk))
                    await asyncio.to_thread(destination.flush)
                    await asyncio.to_thread(os.fsync, destination.fileno())
                finally:
                    await asyncio.to_thread(destination.close)
        except (ClientError, TimeoutError) as err:
            raise HomeplanError(
                503, "sourceUnavailable", "The source transfer was interrupted."
            ) from err
        if received != size or hasher.hexdigest() != text(expected["sha256"]):
            raise HomeplanError(
                422,
                "checksumMismatch",
                "An artifact file failed size/checksum verification.",
            )

    async def house(self, house_id: str) -> dict[str, object]:
        return await self.json(
            f"houses/{quote(house_id, safe='')}/document",
            "HouseDocumentEnvelope",
            maximum=67108864,
        )

    async def preferences(self) -> dict[str, object]:
        return await self.json("preferences", "PreferencesResponse")

    async def frontend(self) -> dict[str, object]:
        return await self.json(
            "viewer/frontend", "FrontendManifest", maximum=MAX_MANIFEST
        )

    async def probe(self) -> None:
        """Compatibility check for a discovered app: the same capabilities read Connect relies on, bounded short."""
        data = await self.data(
            "capabilities",
            MAX_MANIFEST,
            timeout=ClientTimeout(total=10, connect=5, sock_read=5),
        )
        capabilities = record(await asyncio.to_thread(parse_json, data))
        if not isinstance(capabilities.get("houseSnapshots"), dict):
            raise HomeplanError(
                422,
                "incompatibleSnapshot",
                "The discovered Homeplan app does not export saved house snapshots.",
            )


def discovered_url(config: object) -> str:
    """The app's internal base URL from its Supervisor discovery payload `{host, port, api}`.

    Only the documented fields are read; anything else in the payload (HA adds `addon`) is ignored.
    """
    payload = record(config)
    host = payload.get("host")
    port = payload.get("port")
    if (
        not isinstance(host, str)
        or not host
        or isinstance(port, bool)
        or not isinstance(port, int)
        or not 0 < port < 65536
    ):
        raise HomeplanError(
            422, "invalidDiscovery", "The discovery payload lacks a valid host/port."
        )
    if payload.get("api") != API_PROTOCOL:
        raise HomeplanError(
            422,
            "incompatibleDiscovery",
            "The discovered Homeplan app speaks a different integration API version.",
        )
    authority = f"[{host}]" if ":" in host else host
    url = normalize_url(f"http://{authority}:{port}/")
    if url is None:
        raise HomeplanError(422, "invalidDiscovery", "Empty discovered address.")
    return url
