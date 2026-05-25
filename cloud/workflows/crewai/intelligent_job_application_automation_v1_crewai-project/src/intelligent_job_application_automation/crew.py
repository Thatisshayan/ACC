import json
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from crewai import LLM
from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task
from crewai_tools import (
	FileReadTool,
	tool,
)

def _env_has(name: str) -> bool:
    return bool(os.environ.get(name, "").strip())

def _format_search_results(results):
    if not results:
        return "No results found."
    parts = []
    for item in results[:5]:
        parts.append(
            f"Title: {item.get('title', 'N/A')}\n"
            f"URL: {item.get('link', item.get('url', 'N/A'))}\n"
            f"Snippet: {item.get('snippet', item.get('description', 'N/A'))}"
        )
    return "\n\n".join(parts)

@tool("SerpAPI Search")
def serpapi_search(query: str) -> str:
    """Search the web using SerpAPI when SERPER_API_KEY is not available."""
    api_key = os.environ.get("SERPAPI_API_KEY", "").strip()
    if not api_key:
        return "SERPAPI_API_KEY not set."

    params = urlencode({
        "engine": "google",
        "q": query,
        "api_key": api_key,
        "num": 5,
    })
    url = f"https://serpapi.com/search.json?{params}"

    try:
        with urlopen(url, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
        organic = payload.get("organic_results") or []
        return _format_search_results(organic)
    except Exception as exc:
        return f"SerpAPI search error: {exc}"

@tool("Job Search Web")
def job_search_web(query: str) -> str:
    """Search jobs using Serper first, then SerpAPI as fallback."""
    serper_error = "SERPER_API_KEY not set."
    serpapi_error = "SERPAPI_API_KEY not set."

    serper_key = os.environ.get("SERPER_API_KEY", "").strip()
    if serper_key:
        try:
            payload = json.dumps({ "q": query, "num": 5 }).encode("utf-8")
            request = Request(
                "https://google.serper.dev/search",
                data=payload,
                headers={
                    "X-API-KEY": serper_key,
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urlopen(request, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
            organic = payload.get("organic") or payload.get("organic_results") or []
            formatted = _format_search_results(organic)
            if formatted != "No results found.":
                return formatted
            serper_error = "Serper returned no results."
        except Exception as exc:
            serper_error = f"Serper search error: {exc}"

    serpapi_key = os.environ.get("SERPAPI_API_KEY", "").strip()
    if serpapi_key:
        try:
            params = urlencode({
                "engine": "google",
                "q": query,
                "api_key": serpapi_key,
                "num": 5,
            })
            url = f"https://serpapi.com/search.json?{params}"
            with urlopen(url, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
            organic = payload.get("organic_results") or []
            formatted = _format_search_results(organic)
            if formatted != "No results found.":
                return formatted
            serpapi_error = "SerpAPI returned no results."
        except Exception as exc:
            serpapi_error = f"SerpAPI search error: {exc}"

    return "\n".join([
        "No search provider available.",
        serper_error,
        serpapi_error,
    ])

def build_job_search_tools():
    return [job_search_web]





@CrewBase
class IntelligentJobApplicationAutomationCrew:
    """IntelligentJobApplicationAutomation crew"""

    
    @agent
    def job_search_specialist(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["job_search_specialist"],
            
            
            tools=build_job_search_tools(),
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            
            
            max_execution_time=None,
            llm=LLM(
                model="openai/gpt-4o-mini",
                
                
            ),
            
        )
        
    
    @agent
    def job_match_analyzer(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["job_match_analyzer"],
            
            
            tools=[],
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            
            
            max_execution_time=None,
            llm=LLM(
                model="openai/gpt-4o-mini",
                
                
            ),
            
        )
        
    
    @agent
    def resume_tailor(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["resume_tailor"],
            
            
            tools=[				FileReadTool()],
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            
            
            max_execution_time=None,
            llm=LLM(
                model="openai/gpt-4o-mini",
                
                
            ),
            
        )
        
    
    @agent
    def job_application_manager(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["job_application_manager"],
            
            
            tools=[],
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            
            apps=[
                    "google_gmail/send_email",
                    
                    "google_gmail/create_draft",
                    ],
            
            
            max_execution_time=None,
            llm=LLM(
                model="openai/gpt-4o-mini",
                
                
            ),
            
        )
        
    

    
    @task
    def search_job_opportunities(self) -> Task:
        return Task(
            config=self.tasks_config["search_job_opportunities"],
            markdown=False,
            
            
        )
    
    @task
    def analyze_and_score_job_matches(self) -> Task:
        return Task(
            config=self.tasks_config["analyze_and_score_job_matches"],
            markdown=False,
            
            
        )
    
    @task
    def prepare_tailored_application_materials(self) -> Task:
        return Task(
            config=self.tasks_config["prepare_tailored_application_materials"],
            markdown=False,
            
            
        )
    
    @task
    def execute_job_applications(self) -> Task:
        return Task(
            config=self.tasks_config["execute_job_applications"],
            markdown=False,
            
            
        )
    

    @crew
    def crew(self) -> Crew:
        """Creates the IntelligentJobApplicationAutomation crew"""

        return Crew(
            agents=self.agents,  # Automatically created by the @agent decorator
            tasks=self.tasks,  # Automatically created by the @task decorator
            process=Process.sequential,
            verbose=True,

            chat_llm=LLM(model="openai/gpt-4o-mini"),
        )
