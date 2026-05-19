import os

from crewai import LLM
from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task
from crewai_tools import (
	SerperDevTool,
	JinaScrapeWebsiteTool,
	FileReadTool
)






@CrewBase
class IntelligentJobApplicationAutomationCrew:
    """IntelligentJobApplicationAutomation crew"""

    
    @agent
    def job_search_specialist(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["job_search_specialist"],
            
            
            tools=[				SerperDevTool(),
				JinaScrapeWebsiteTool()],
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


