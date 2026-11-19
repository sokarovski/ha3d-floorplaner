"""Sanitized errors shared by the storage, transfer and HTTP boundaries."""


class HomeplanError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message

    def envelope(self) -> dict[str, object]:
        return {"error": {"code": self.code, "message": self.message}}
