"""
Consolidated actions for Framework.
This file contains tools for requirement analysis.
"""

import json

from metagpt.actions import Action
from metagpt.actions.requirement_analysis import EvaluateAction, EvaluationData
from metagpt.logs import logger
from metagpt.tools.tool_registry import register_tool
from metagpt.utils.common import general_after_log, to_markdown_code_block
from tenacity import retry, stop_after_attempt, wait_random_exponential

# --- Framework Actions ---
# The following classes represent specific AI-driven actions to analyze and document requirements.

"\n@Time    : 2024/6/13\n@Author  : mashenquan\n@File    : evaluate_framework.py\n@Desc    : The implementation of Chapter 2.1.8 of RFC243. https://deepwisdom.feishu.cn/wiki/QobGwPkImijoyukBUKHcrYetnBb\n"


@register_tool(include_functions=["run"])
class EvaluateFramework(EvaluateAction):
    """WriteFramework deal with the following situations:
    1. Given a TRD and the software framework based on the TRD, evaluate the quality of the software framework.
    """

    async def run(
        self,
        *,
        use_case_actors: str,
        trd: str,
        acknowledge: str,
        legacy_output: str,
        additional_technical_requirements: str,
    ) -> EvaluationData:
        """
        Run the evaluation of the software framework based on the provided TRD and related parameters.

        Args:
            use_case_actors (str): A description of the actors involved in the use case.
            trd (str): The Technical Requirements Document (TRD) that outlines the requirements for the software framework.
            acknowledge (str): External acknowledgments or acknowledgments information related to the framework.
            legacy_output (str): The previous versions of software framework returned by `WriteFramework`.
            additional_technical_requirements (str): Additional technical requirements that need to be considered during evaluation.

        Returns:
            EvaluationData: An object containing the results of the evaluation.

        Example:
            >>> evaluate_framework = EvaluateFramework()
            >>> use_case_actors = "- Actor: game player;\\n- System: snake game; \\n- External System: game center;"
            >>> trd = "## TRD\\n..."
            >>> acknowledge = "## Interfaces\\n..."
            >>> framework = '{"path":"balabala", "filename":"...", ...'
            >>> constraint = "Using Java language, ..."
            >>> evaluation = await evaluate_framework.run(
            >>>     use_case_actors=use_case_actors,
            >>>     trd=trd,
            >>>     acknowledge=acknowledge,
            >>>     legacy_output=framework,
            >>>     additional_technical_requirements=constraint,
            >>> )
            >>> is_pass = evaluation.is_pass
            >>> print(is_pass)
            True
            >>> evaluation_conclusion = evaluation.conclusion
            >>> print(evaluation_conclusion)
            Balabala...
        """
        prompt = PROMPT.format(
            use_case_actors=use_case_actors,
            trd=to_markdown_code_block(val=trd),
            acknowledge=to_markdown_code_block(val=acknowledge),
            legacy_output=to_markdown_code_block(val=legacy_output),
            additional_technical_requirements=to_markdown_code_block(
                val=additional_technical_requirements
            ),
        )
        return await self._vote(prompt)


PROMPT = '\n## Actor, System, External System\n{use_case_actors}\n\n## Legacy TRD\n{trd}\n\n## Acknowledge\n{acknowledge}\n\n## Legacy Outputs\n{legacy_output}\n\n## Additional Technical Requirements\n{additional_technical_requirements}\n\n---\nYou are a tool that evaluates the quality of framework code based on the TRD content;\nYou need to refer to the content of the "Legacy TRD" section to check for any errors or omissions in the framework code found in "Legacy Outputs";\nThe content of "Actor, System, External System" provides an explanation of actors and systems that appear in UML Use Case diagram;\nInformation about the external system missing from the "Legacy TRD" can be found in the "Acknowledge" section;\nWhich interfaces defined in "Acknowledge" are used in the "Legacy TRD"?\nDo not implement the interface in "Acknowledge" section until it is used in "Legacy TRD", you can check whether they are the same interface by looking at its ID or url;\nParts not mentioned in the "Legacy TRD" will be handled by other TRDs, therefore, processes not present in the "Legacy TRD" are considered ready;\n"Additional Technical Requirements" specifies the additional technical requirements that the generated software framework code must meet;\nDo the parameters of the interface of the external system used in the code comply with it\'s specifications in \'Acknowledge\'?\nIs there a lack of necessary configuration files?\nReturn a markdown JSON object with:\n- an "issues" key containing a string list of natural text about the issues that need to addressed, found in the "Legacy Outputs" if any exits, each issue found must provide a detailed description and include reasons;\n- a "conclusion" key containing the evaluation conclusion;\n- a "misalignment" key containing the judgement detail of the natural text string list about the misalignment with "Legacy TRD";\n- a "is_pass" key containing a true boolean value if there is not any issue in the "Legacy Outputs";\n'

"\n@Time    : 2024/6/13\n@Author  : mashenquan\n@File    : write_framework.py\n@Desc    : The implementation of Chapter 2.1.8 of RFC243. https://deepwisdom.feishu.cn/wiki/QobGwPkImijoyukBUKHcrYetnBb\n"


@register_tool(include_functions=["run"])
class WriteFramework(Action):
    """WriteFramework deal with the following situations:
    1. Given a TRD, write out the software framework.
    """

    async def run(
        self,
        *,
        use_case_actors: str,
        trd: str,
        acknowledge: str,
        legacy_output: str,
        evaluation_conclusion: str,
        additional_technical_requirements: str,
    ) -> str:
        """
        Run the action to generate a software framework based on the provided TRD and related information.

        Args:
            use_case_actors (str): Description of the use case actors involved.
            trd (str): Technical Requirements Document detailing the requirements.
            acknowledge (str): External acknowledgements or acknowledgements required.
            legacy_output (str): Previous version of the software framework returned by `WriteFramework.run`.
            evaluation_conclusion (str): Conclusion from the evaluation of the requirements.
            additional_technical_requirements (str): Any additional technical requirements.

        Returns:
            str: The generated software framework as a string.

        Example:
            >>> write_framework = WriteFramework()
            >>> use_case_actors = "- Actor: game player;\\n- System: snake game; \\n- External System: game center;"
            >>> trd = "## TRD\\n..."
            >>> acknowledge = "## Interfaces\\n..."
            >>> legacy_output = '{"path":"balabala", "filename":"...", ...'
            >>> evaluation_conclusion = "Balabala..."
            >>> constraint = "Using Java language, ..."
            >>> framework = await write_framework.run(
            >>>    use_case_actors=use_case_actors,
            >>>    trd=trd,
            >>>    acknowledge=acknowledge,
            >>>    legacy_output=framework,
            >>>    evaluation_conclusion=evaluation_conclusion,
            >>>    additional_technical_requirements=constraint,
            >>> )
            >>> print(framework)
            {"path":"balabala", "filename":"...", ...

        """
        acknowledge = await self._extract_external_interfaces(
            trd=trd, knowledge=acknowledge
        )
        prompt = PROMPT.format(
            use_case_actors=use_case_actors,
            trd=to_markdown_code_block(val=trd),
            acknowledge=to_markdown_code_block(val=acknowledge),
            legacy_output=to_markdown_code_block(val=legacy_output),
            evaluation_conclusion=evaluation_conclusion,
            additional_technical_requirements=to_markdown_code_block(
                val=additional_technical_requirements
            ),
        )
        return await self._write(prompt)

    @retry(
        wait=wait_random_exponential(min=1, max=20),
        stop=stop_after_attempt(6),
        after=general_after_log(logger),
    )
    async def _write(self, prompt: str) -> str:
        rsp = await self.llm.aask(prompt)
        tags = ["```json", "```"]
        bix = rsp.find(tags[0])
        eix = rsp.rfind(tags[1])
        if bix >= 0:
            rsp = rsp[bix : eix + len(tags[1])]
        json_data = rsp.removeprefix("```json").removesuffix("```")
        json.loads(json_data)
        return json_data

    @retry(
        wait=wait_random_exponential(min=1, max=20),
        stop=stop_after_attempt(6),
        after=general_after_log(logger),
    )
    async def _extract_external_interfaces(self, trd: str, knowledge: str) -> str:
        prompt = f"## TRD\n{to_markdown_code_block(val=trd)}\n\n## Knowledge\n{to_markdown_code_block(val=knowledge)}\n"
        rsp = await self.llm.aask(
            prompt,
            system_msgs=[
                "You are a tool that removes impurities from articles; you can remove irrelevant content from articles.",
                'Identify which interfaces are used in "TRD"? Remove the relevant content of the interfaces NOT used in "TRD" from "Knowledge" and return the simplified content of "Knowledge".',
            ],
        )
        return rsp


PROMPT = '\n## Actor, System, External System\n{use_case_actors}\n\n## TRD\n{trd}\n\n## Acknowledge\n{acknowledge}\n\n## Legacy Outputs\n{legacy_output}\n\n## Evaluation Conclusion\n{evaluation_conclusion}\n\n## Additional Technical Requirements\n{additional_technical_requirements}\n\n---\nYou are a tool that generates software framework code based on TRD.\nThe content of "Actor, System, External System" provides an explanation of actors and systems that appear in UML Use Case diagram;\nThe descriptions of the interfaces of the external system used in the "TRD" can be found in the "Acknowledge" section; Do not implement the interface of the external system in "Acknowledge" section until it is used in "TRD";\n"Legacy Outputs" contains the software framework code generated by you last time, which you can improve by addressing the issues raised in "Evaluation Conclusion";\n"Additional Technical Requirements" specifies the additional technical requirements that the generated software framework code must meet;\nDevelop the software framework based on the "TRD", the output files should include:\n- The `README.md` file should include:\n  - The folder structure diagram of the entire project;\n  - Correspondence between classes, interfaces, and functions with the content in the "TRD" section；\n  - Prerequisites if necessary;\n  - Installation if necessary;\n  - Configuration if necessary;\n  - Usage if necessary;\n- The `CLASS.md` file should include the class diagram in PlantUML format based on the "TRD";\n- The `SEQUENCE.md` file should include the sequence diagram in PlantUML format based on the "TRD";\n- The source code files that implement the "TRD" and "Additional Technical Requirements"; do not add comments to source code files;\n- The configuration files that required by the source code files, "TRD" and "Additional Technical Requirements";\n  \nReturn a markdown JSON object list, each object containing:\n- a "path" key with a value specifying its path;\n- a "filename" key with a value specifying its file name;\n- a "content" key with a value containing its file content;\n'
