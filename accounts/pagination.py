"""Pagination classes for Brightloop REST API."""

from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """Standard pagination supporting ?page=1&page_size=20 query parameters."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

