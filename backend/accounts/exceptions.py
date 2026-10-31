"""Custom exception handler for REST API error response shaping."""

from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    """Format validation errors as {field: [messages]} and others as {detail: message}."""
    response = exception_handler(exc, context)

    if response is not None:
        if isinstance(response.data, dict):
            if "non_field_errors" in response.data:
                err = response.data.pop("non_field_errors")
                detail_msg = err[0] if isinstance(err, list) and err else str(err)
                response.data["detail"] = str(detail_msg)
        elif isinstance(response.data, list):
            detail_msg = response.data[0] if response.data else "Invalid request."
            response.data = {"detail": str(detail_msg)}

    return response

