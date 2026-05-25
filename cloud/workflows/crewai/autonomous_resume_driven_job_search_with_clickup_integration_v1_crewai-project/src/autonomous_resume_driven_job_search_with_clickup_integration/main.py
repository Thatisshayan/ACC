#!/usr/bin/env python
import json
import os
import sys


def _load_json_env(name):
    raw = os.environ.get(name, "").strip()
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except Exception:
        return {}
    return value if isinstance(value, dict) else {}


def _crew_class():
    from autonomous_resume_driven_job_search_with_clickup_integration.crew import AutonomousResumeDrivenJobSearchWithClickupIntegrationCrew
    return AutonomousResumeDrivenJobSearchWithClickupIntegrationCrew


def build_inputs():
    inputs = {
        'resume_file_path': os.environ.get('RESUME_FILE_PATH', '').strip(),
        'target_role': os.environ.get('TARGET_ROLE', '').strip(),
        'job_query': os.environ.get('JOB_QUERY', '').strip(),
        'location': os.environ.get('JOB_LOCATION', '').strip(),
        'clickup_list_id': os.environ.get('CLICKUP_LIST_ID', '').strip(),
    }

    inputs.update(_load_json_env('ACC_WORKFLOW_INPUTS_JSON'))

    if not inputs.get('job_query') and inputs.get('target_role'):
        inputs['job_query'] = inputs['target_role']

    if not inputs.get('search_query'):
        inputs['search_query'] = inputs.get('job_query') or inputs.get('target_role') or inputs.get('workflow_input') or ''

    if not inputs.get('resume_content') and inputs.get('resume_file_path'):
        inputs['resume_content'] = inputs['resume_file_path']

    return inputs


def _serialize_result(result, inputs):
    if isinstance(result, dict):
        payload = dict(result)
    else:
        payload = {
            'raw': getattr(result, 'raw', None),
            'output': getattr(result, 'output', None),
            'text': getattr(result, 'text', None),
            'value': getattr(result, 'value', None),
            'result': str(result),
        }

    output = payload.get('raw') or payload.get('output') or payload.get('text') or payload.get('result') or ''
    summary = payload.get('summary') or (output[:240] if output else 'CrewAI workflow completed')

    return {
        'success': payload.get('success', True),
        'summary': summary,
        'output': output,
        'payload': payload,
        'inputs': inputs,
    }


def run():
    inputs = build_inputs()
    try:
        result = _crew_class()().crew().kickoff(inputs=inputs)
        payload = _serialize_result(result, inputs)
        print(json.dumps(payload, ensure_ascii=False))
        return payload
    except Exception as exc:
        payload = {
            'success': False,
            'summary': 'CrewAI workflow failed',
            'error': str(exc),
            'output': '',
            'inputs': inputs,
        }
        print(json.dumps(payload, ensure_ascii=False))
        sys.exit(1)


def train():
    inputs = build_inputs()
    try:
        _crew_class()().crew().train(
            n_iterations=int(sys.argv[1]),
            filename=sys.argv[2],
            inputs=inputs,
        )
    except Exception as e:
        raise Exception(f"An error occurred while training the crew: {e}")


def replay():
    try:
        _crew_class()().crew().replay(task_id=sys.argv[1])
    except Exception as e:
        raise Exception(f"An error occurred while replaying the crew: {e}")


def test():
    inputs = build_inputs()
    try:
        _crew_class()().crew().test(
            n_iterations=int(sys.argv[1]),
            openai_model_name=sys.argv[2],
            inputs=inputs,
        )
    except Exception as e:
        raise Exception(f"An error occurred while testing the crew: {e}")


def run_with_trigger():
    return run()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: main.py <command> [<args>]")
        sys.exit(1)

    command = sys.argv[1]
    if command == "run":
        run()
    elif command == "train":
        train()
    elif command == "replay":
        replay()
    elif command == "test":
        test()
    elif command == "run_with_trigger":
        run_with_trigger()
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
