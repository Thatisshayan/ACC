import os

from crewai import LLM
from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task
from crewai_tools import (
	ScrapeWebsiteTool,
	DallETool,
	FileReadTool
)






@CrewBase
class CostOptimizedAiVideoProductionSuiteCrew:
    """CostOptimizedAiVideoProductionSuite crew"""

    
    @agent
    def video_content_researcher(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["video_content_researcher"],
            
            
            tools=[				ScrapeWebsiteTool()],
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
    def video_script_writer(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["video_script_writer"],
            
            
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
    def visual_content_director(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["visual_content_director"],
            
            
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
    def image_generator(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["image_generator"],
            
            
            tools=[				DallETool()],
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
    def email_delivery_specialist(self) -> Agent:
        
        
        return Agent(
            config=self.agents_config["email_delivery_specialist"],
            
            
            tools=[				FileReadTool()],
            reasoning=False,
            max_reasoning_attempts=None,
            inject_date=True,
            allow_delegation=False,
            max_iter=25,
            max_rpm=None,
            
            apps=[
                    "google_gmail/send_email",
                    ],
            
            
            max_execution_time=None,
            llm=LLM(
                model="openai/gpt-4o-mini",
                
                
            ),
            
        )
        
    

    
    @task
    def research_video_content(self) -> Task:
        return Task(
            config=self.tasks_config["research_video_content"],
            markdown=False,
            
            
        )
    
    @task
    def write_video_script(self) -> Task:
        return Task(
            config=self.tasks_config["write_video_script"],
            markdown=False,
            
            
        )
    
    @task
    def create_visual_REDACTED_guide(self) -> Task:
        return Task(
            config=self.tasks_config["create_visual_REDACTED_guide"],
            markdown=False,
            
            
        )
    
    @task
    def generate_scene_images(self) -> Task:
        return Task(
            config=self.tasks_config["generate_scene_images"],
            markdown=False,
            
            
        )
    
    @task
    def deliver_complete_video_package(self) -> Task:
        return Task(
            config=self.tasks_config["deliver_complete_video_package"],
            markdown=False,
            
            
        )
    

    @crew
    def crew(self) -> Crew:
        """Creates the CostOptimizedAiVideoProductionSuite crew"""

        return Crew(
            agents=self.agents,  # Automatically created by the @agent decorator
            tasks=self.tasks,  # Automatically created by the @task decorator
            process=Process.sequential,
            verbose=True,

            chat_llm=LLM(model="openai/gpt-4o-mini"),
        )


