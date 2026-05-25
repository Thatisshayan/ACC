from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from typing import Type
import json
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class JobSearchWebInput(BaseModel):
    """Input schema for the web search tool."""

    query: str = Field(..., description="Job search query to run.")


class JobSearchWebTool(BaseTool):
    name: str = "Job Search Web"
    description: str = (
        "Search the web for job opportunities. Prefers Serper first and falls back to SerpAPI."
    )
    args_schema: Type[BaseModel] = JobSearchWebInput

    def _format_results(self, results):
        if not results:
            return "No results found."

        parts = []
        for item in results[:5]:
            parts.append(
                "Title: {title}\nURL: {url}\nSnippet: {snippet}".format(
                    title=item.get("title", "N/A"),
                    url=item.get("link", item.get("url", "N/A")),
                    snippet=item.get("snippet", item.get("description", "N/A")),
                )
            )
        return "\n\n".join(parts)

    def _search_serper(self, query):
        api_key = os.environ.get("SERPER_API_KEY", "").strip()
        if not api_key:
            return None, "SERPER_API_KEY not set."

        try:
            payload = json.dumps({"q": query, "num": 5}).encode("utf-8")
            request = Request(
                "https://google.serper.dev/search",
                data=payload,
                headers={
                    "X-API-KEY": api_key,
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urlopen(request, timeout=20) as response:
                data = json.loads(response.read().decode("utf-8"))
            organic = data.get("organic") or data.get("organic_results") or []
            formatted = self._format_results(organic)
            if formatted != "No results found.":
                return formatted, None
            return None, "Serper returned no results."
        except Exception as exc:
            return None, f"Serper search error: {exc}"

    def _search_serpapi(self, query):
        api_key = os.environ.get("SERPAPI_API_KEY", "").strip()
        if not api_key:
            return None, "SERPAPI_API_KEY not set."

        try:
            params = urlencode({
                "engine": "google",
                "q": query,
                "api_key": api_key,
                "num": 5,
            })
            url = f"https://serpapi.com/search.json?{params}"
            with urlopen(url, timeout=20) as response:
                data = json.loads(response.read().decode("utf-8"))
            organic = data.get("organic_results") or []
            formatted = self._format_results(organic)
            if formatted != "No results found.":
                return formatted, None
            return None, "SerpAPI returned no results."
        except Exception as exc:
            return None, f"SerpAPI search error: {exc}"

    def _run(self, query: str) -> str:
        result, error = self._search_serper(query)
        if result:
            return result

        fallback_result, fallback_error = self._search_serpapi(query)
        if fallback_result:
            return fallback_result

        return "\n".join(
            [
                "No search provider available.",
                error or "SERPER_API_KEY not set.",
                fallback_error or "SERPAPI_API_KEY not set.",
            ]
        )
