#!/usr/bin/env python3
"""
ACC v2 CrewAI Agent - Executes ACC tasks using CrewAI with DeepSeek LLM.
Reads task JSON from file path in sys.argv[1], runs a crew of 3 agents,
and outputs result as JSON to stdout.
"""

import json
import os
import sys
from pathlib import Path

# Load environment variables from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# CrewAI imports
from crewai import Agent, Task, Crew, Process
from crewai_tools import tool

# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

@tool("DuckDuckGo Search")
def duckduckgo_search(query: str) -> str:
    """Search the web using DuckDuckGo. Returns text results."""
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))
            if not results:
                return "No results found."
            return "\n\n".join(
                f"Title: {r.get('title', 'N/A')}\nURL: {r.get('href', 'N/A')}\nSnippet: {r.get('body', 'N/A')}"
                for r in results
            )
    except ImportError:
        return "DuckDuckGo search not available (install duckduckgo_search)."
    except Exception as e:
        return f"Search error: {str(e)}"


# ---------------------------------------------------------------------------
# LLM configuration
# ---------------------------------------------------------------------------

def get_llm():
    """Create and return a DeepSeek LLM instance (OpenAI-compatible)."""
    from langchain_openai import ChatOpenAI

    base_url = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        raise ValueError("DEEPSEEK_API_KEY environment variable is not set")

    return ChatOpenAI(
        model="deepseek-chat",
        openai_api_base=base_url,
        openai_api_key=api_key,
        temperature=0.3,
        max_tokens=4096,
    )


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------

def create_agents(llm):
    """Create and return the three agents: Researcher, Writer, Reviewer."""
    researcher = Agent(
        role="Senior Research Analyst",
        goal="Conduct thorough research on the given topic using web search tools.",
        backstory="You are an expert research analyst with years of experience in gathering "
                  "and synthesizing information from multiple sources. You use DuckDuckGo "
                  "to find the most relevant and up-to-date information.",
        tools=[duckduckgo_search],
        llm=llm,
        allow_delegation=False,
        verbose=True,
    )

    writer = Agent(
        role="Content Writer",
        goal="Write clear, comprehensive, and well-structured content based on research findings.",
        backstory="You are a skilled writer who transforms research into engaging, accurate, "
                  "and actionable content. You ensure the output is well-organized and meets "
                  "the requirements specified in the task.",
        llm=llm,
        allow_delegation=False,
        verbose=True,
    )

    reviewer = Agent(
        role="Quality Assurance Reviewer",
        goal="Review the written content for accuracy, completeness, clarity, and adherence to task requirements.",
        backstory="You are a meticulous reviewer with an eye for detail. You check for factual accuracy, "
                  "logical flow, grammar, and ensure the output fully addresses the task instructions. "
                  "You provide constructive feedback and request revisions when necessary.",
        llm=llm,
        allow_delegation=False,
        verbose=True,
    )

    return researcher, writer, reviewer


# ---------------------------------------------------------------------------
# Task factory
# ---------------------------------------------------------------------------

def create_tasks(task_instruction: str, researcher, writer, reviewer):
    """Create the three tasks for the crew based on the ACC task instruction."""
    research_task = Task(
        description=(
            f"Research the following topic thoroughly using web search tools:\n\n"
            f"{task_instruction}\n\n"
            f"Gather relevant information, key facts, data points, and insights. "
            f"Provide a comprehensive research summary with citations where possible."
        ),
        expected_output="A detailed research summary with key findings, data points, and sources.",
        agent=researcher,
    )

    write_task = Task(
        description=(
            f"Based on the research provided, write a comprehensive output that addresses "
            f"the following task:\n\n{task_instruction}\n\n"
            f"Ensure the content is well-structured, clear, and actionable. "
            f"Use appropriate headings, bullet points, and formatting as needed."
        ),
        expected_output="A well-written, complete document addressing the task requirements.",
        agent=writer,
        context=[research_task],
    )

    review_task = Task(
        description=(
            f"Review the written content for quality, accuracy, and completeness. "
            f"Check that it fully addresses the task:\n\n{task_instruction}\n\n"
            f"Verify factual accuracy, logical flow, clarity, and adherence to requirements. "
            f"If revisions are needed, provide specific feedback. Otherwise, confirm the output is ready."
        ),
        expected_output="A quality assessment and the final approved output.",
        agent=reviewer,
        context=[research_task, write_task],
    )

    return research_task, write_task, review_task


# ---------------------------------------------------------------------------
# Main execution
# ---------------------------------------------------------------------------

def main():
    try:
        # Validate arguments
        if len(sys.argv) < 2:
            raise ValueError("Missing task file path argument. Usage: crewai_agent.py <task_file.json>")

        task_file = sys.argv[1]
        if not os.path.exists(task_file):
            raise FileNotFoundError(f"Task file not found: {task_file}")

        # Read task JSON
        with open(task_file, "r") as f:
            task_data = json.load(f)

        # Extract task instruction
        task_instruction = task_data.get("instruction") or task_data.get("task") or task_data.get("prompt")
        if not task_instruction:
            raise ValueError("Task JSON must contain 'instruction', 'task', or 'prompt' field")

        # Initialize LLM
        llm = get_llm()

        # Create agents
        researcher, writer, reviewer = create_agents(llm)

        # Create tasks
        research_task, write_task, review_task = create_tasks(
            task_instruction, researcher, writer, reviewer
        )

        # Create and run crew
        crew = Crew(
            agents=[researcher, writer, reviewer],
            tasks=[research_task, write_task, review_task],
            process=Process.sequential,
            verbose=True,
        )

        result = crew.kickoff()

        # Extract output - CrewAI v0.80+ returns a CrewOutput object
        if hasattr(result, 'raw'):
            output = result.raw
        elif hasattr(result, 'output'):
            output = result.output
        else:
            output = str(result)

        # Generate summary (first 200 chars)
        summary = output.strip()[:200].replace("\n", " ") + ("..." if len(output) > 200 else "")

        # Print success result
        print(json.dumps({
            "success": True,
            "output": output,
            "summary": summary,
        }))

    except Exception as e:
        # Print error result
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(json.dumps({
            "success": False,
            "error": error_msg,
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()