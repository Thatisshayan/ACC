import os

from crewai import LLM
from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task
from crewai_tools import FileReadTool

from .tools.custom_tool import JobSearchWebTool






@CrewBase
class AutonomousResumeDrivenJobSearchWithClickupIntegrationCrew:
    """AutonomousResumeDrivenJobSearchWithClickupIntegration crew"""

    
    @agent
    def resume_analyzer(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["resume_analyzer"],
            
            
            tools=[FileReadTool()],
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
    def job_search_specialist(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["job_search_specialist"],
            
            
            tools=[JobSearchWebTool()],
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
    def job_match_evaluator(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["job_match_evaluator"],
            
            
            tools=[FileReadTool(), JobSearchWebTool()],
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
    def application_manager(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["application_manager"],
            
            
            tools=[FileReadTool(), JobSearchWebTool()],
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            
            apps=[
                    "google_sheets/create_spreadsheet",
                    
                    "google_sheets/append_values",
                    
                    "google_sheets/update_values",
                    
                    "google_calendar/create_event",
                    
                    "google_gmail/send_email",
                    
                    "google_gmail/create_draft",
                    
                    "clickup/create_task",
                    
                    "clickup/update_task",
                    
                    "clickup/get_list",
                    ],
            
            
            max_execution_time=None,
            llm=LLM(
                model="openai/gpt-4o-mini",
                
                
            ),
            
        )
        
    
    @agent
    def linkedin_specialist(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["linkedin_specialist"],
            
            
            tools=[JobSearchWebTool()],
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
    def cover_letter_communication_specialist(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["cover_letter_communication_specialist"],
            
            
            tools=[JobSearchWebTool()],
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
    def market_intelligence_salary_research_specialist(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["market_intelligence_salary_research_specialist"],
            
            
            tools=[JobSearchWebTool()],
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
    def interview_preparation_success_strategist(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["interview_preparation_success_strategist"],
            
            
            tools=[JobSearchWebTool()],
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            
            apps=[
                    "google_docs/create_document_with_content",
                    ],
            
            
            max_execution_time=None,
            llm=LLM(
                model="openai/gpt-4o-mini",
                
                
            ),
            
        )
        
    
    @agent
    def job_search_analytics_performance_optimizer(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["job_search_analytics_performance_optimizer"],
            
            
            tools=[JobSearchWebTool()],
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            
            apps=[
                    "google_sheets/get_values",
                    
                    "google_sheets/update_values",
                    
                    "clickup/search_tasks",
                    
                    "clickup/update_task",
                    
                    "google_docs/create_document_with_content",
                    ],
            
            
            max_execution_time=None,
            llm=LLM(
                model="openai/gpt-4o-mini",
                
                
            ),
            
        )
        
    
    @agent
    def crm_relationship_manager(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["crm_relationship_manager"],
            
            
            tools=[FileReadTool(), JobSearchWebTool()],
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            
            apps=[
                    "hubspot/create_contact",
                    
                    "hubspot/create_company",
                    
                    "hubspot/create_deal",
                    
                    "hubspot/update_contact",
                    
                    "hubspot/update_deal",
                    ],
            
            
            max_execution_time=None,
            llm=LLM(
                model="openai/gpt-4o-mini",
                
                
            ),
            
        )
        
    

    
    @task
    def analyze_resume(self) -> Task:
        return Task(
            config=self.tasks_config["analyze_resume"],
            markdown=False,
            
            
        )
    
    @task
    def linkedin_job_search_networking(self) -> Task:
        return Task(
            config=self.tasks_config["linkedin_job_search_networking"],
            markdown=False,
            
            
        )
    
    @task
    def search_job_opportunities(self) -> Task:
        return Task(
            config=self.tasks_config["search_job_opportunities"],
            markdown=False,
            
            
        )
    
    @task
    def conduct_market_intelligence_salary_research(self) -> Task:
        return Task(
            config=self.tasks_config["conduct_market_intelligence_salary_research"],
            markdown=False,
            
            
        )
    
    @task
    def evaluate_job_matches(self) -> Task:
        return Task(
            config=self.tasks_config["evaluate_job_matches"],
            markdown=False,
            
            
        )
    
    @task
    def generate_personalized_application_materials(self) -> Task:
        return Task(
            config=self.tasks_config["generate_personalized_application_materials"],
            markdown=False,
            
            
        )
    
    @task
    def prepare_interview_success_materials(self) -> Task:
        return Task(
            config=self.tasks_config["prepare_interview_success_materials"],
            markdown=False,
            
            
        )
    
    @task
    def manage_professional_crm_networking(self) -> Task:
        return Task(
            config=self.tasks_config["manage_professional_crm_networking"],
            markdown=False,
            
            
        )
    
    @task
    def execute_job_applications(self) -> Task:
        return Task(
            config=self.tasks_config["execute_job_applications"],
            markdown=False,
            
            
        )
    
    @task
    def generate_performance_analytics_optimization_report(self) -> Task:
        return Task(
            config=self.tasks_config["generate_performance_analytics_optimization_report"],
            markdown=False,
            
            
        )
    

    @crew
    def crew(self) -> Crew:
        """Creates the AutonomousResumeDrivenJobSearchWithClickupIntegration crew"""

        return Crew(
            agents=self.agents,  # Automatically created by the @agent decorator
            tasks=self.tasks,  # Automatically created by the @task decorator
            process=Process.sequential,
            verbose=True,

            chat_llm=LLM(model="openai/gpt-4o-mini"),
        )

