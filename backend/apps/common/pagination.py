from rest_framework.pagination import PageNumberPagination


class BoundedPageNumberPagination(PageNumberPagination):
    """Client-adjustable page size (?page_size=), but capped so a caller
    can never force an unbounded/huge single-page response.
    """

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
