"""
Consolidated actions for TRD (Technical Requirements Document).
This file contains tools for requirement analysis.
"""

from metagpt.actions import Action
from metagpt.actions.requirement_analysis import EvaluateAction, EvaluationData
from metagpt.logs import logger
from metagpt.tools.tool_registry import register_tool
from metagpt.utils.common import general_after_log, to_markdown_code_block
from tenacity import retry, stop_after_attempt, wait_random_exponential

# --- Trd (technical requirements document) Actions ---
# The following classes represent specific AI-driven actions to analyze and document requirements.

"\n@Time    : 2024/6/13\n@Author  : mashenquan\n@File    : write_trd.py\n@Desc    : The implementation of Chapter 2.1.6~2.1.7 of RFC243. https://deepwisdom.feishu.cn/wiki/QobGwPkImijoyukBUKHcrYetnBb\n"


@register_tool(include_functions=["run"])
class WriteTRD(Action):
    """WriteTRD deal with the following situations:
    1. Given some new user requirements, write out a new TRD(Technical Requirements Document).
    2. Given some incremental user requirements, update the legacy TRD.
    """

    async def run(
        self,
        *,
        user_requirements: str = "",
        use_case_actors: str,
        available_external_interfaces: str,
        evaluation_conclusion: str = "",
        interaction_events: str,
        previous_version_trd: str = "",
        legacy_user_requirements: str = "",
        legacy_user_requirements_trd: str = "",
        legacy_user_requirements_interaction_events: str = "",
    ) -> str:
        """
               Handles the writing or updating of a Technical Requirements Document (TRD) based on user requirements.

               Args:
                   user_requirements (str): The new/incremental user requirements.
                   use_case_actors (str): Description of the actors involved in the use case.
                   available_external_interfaces (str): List of available external interfaces.
                   evaluation_conclusion (str, optional): The conclusion of the evaluation of the TRD written by you. Defaults to an empty string.
                   interaction_events (str): The interaction events related to the user requirements that you are handling.
                   previous_version_trd (str, optional): The previous version of the TRD written by you, for updating.
                   legacy_user_requirements (str, optional): Existing user requirements handled by an external object for your use. Defaults to an empty string.
                   legacy_user_requirements_trd (str, optional): The TRD associated with the existing user requirements handled by an external object for your use. Defaults to an empty string.
                   legacy_user_requirements_interaction_events (str, optional): Interaction events related to the existing user requirements handled by an external object for your use. Defaults to an empty string.

               Returns:
                   str: The newly created or updated TRD written by you.

               Example:
                   >>> # Given a new user requirements, write out a new TRD.
                   >>> user_requirements = "Write a 'snake game' TRD."
                   >>> use_case_actors = "- Actor: game player;\\n- System: snake game; \\n- External System: game center;"
                   >>> available_external_interfaces = "The available external interfaces returned by `CompressExternalInterfaces.run` are ..."
                   >>> previous_version_trd = "TRD ..." # The last version of the TRD written out if there is.
                   >>> evaluation_conclusion = "Conclusion ..." # The conclusion returned by `EvaluateTRD.run` if there is.
                   >>> interaction_events = "Interaction ..." # The interaction events returned by `DetectInteraction.run`.
                   >>> write_trd = WriteTRD()
                   >>> new_version_trd = await write_trd.run(
                   >>>     user_requirements=user_requirements,
                   >>>     use_case_actors=use_case_actors,
                   >>>     available_external_interfaces=available_external_interfaces,
                   >>>     evaluation_conclusion=evaluation_conclusion,
                   >>>     interaction_events=interaction_events,
                   >>>     previous_version_trd=previous_version_trd,
                   >>> )
                   >>> print(new_version_trd)
                   ## Technical Requirements Document
        ...

                   >>> # Given an incremental requirements, update the legacy TRD.
                   >>> legacy_user_requirements = ["User requirements 1. ...", "User requirements 2. ...", ...]
                   >>> legacy_user_requirements_trd = "## Technical Requirements Document\\n ..." # The TRD before integrating more user requirements.
                   >>> legacy_user_requirements_interaction_events = ["The interaction events list of user requirements 1 ...", "The interaction events list of user requiremnts 2 ...", ...]
                   >>> use_case_actors = "- Actor: game player;\\n- System: snake game; \\n- External System: game center;"
                   >>> available_external_interfaces = "The available external interfaces returned by `CompressExternalInterfaces.run` are ..."
                   >>> increment_requirements = "The incremental user requirements are ..."
                   >>> evaluation_conclusion = "Conclusion ..." # The conclusion returned by `EvaluateTRD.run` if there is.
                   >>> previous_version_trd = "TRD ..." # The last version of the TRD written out if there is.
                   >>> write_trd = WriteTRD()
                   >>> new_version_trd = await write_trd.run(
                   >>>     user_requirements=increment_requirements,
                   >>>     use_case_actors=use_case_actors,
                   >>>     available_external_interfaces=available_external_interfaces,
                   >>>     evaluation_conclusion=evaluation_conclusion,
                   >>>     interaction_events=interaction_events,
                   >>>     previous_version_trd=previous_version_trd,
                   >>>     legacy_user_requirements=str(legacy_user_requirements),
                   >>>     legacy_user_requirements_trd=legacy_user_requirements_trd,
                   >>>     legacy_user_requirements_interaction_events=str(legacy_user_requirements_interaction_events),
                   >>> )
                   >>> print(new_version_trd)
                   ## Technical Requirements Document
        ...
        """
        if legacy_user_requirements:
            return await self._write_incremental_trd(
                use_case_actors=use_case_actors,
                legacy_user_requirements=legacy_user_requirements,
                available_external_interfaces=available_external_interfaces,
                legacy_user_requirements_trd=legacy_user_requirements_trd,
                legacy_user_requirements_interaction_events=legacy_user_requirements_interaction_events,
                incremental_user_requirements=user_requirements,
                previous_version_trd=previous_version_trd,
                evaluation_conclusion=evaluation_conclusion,
                incremental_user_requirements_interaction_events=interaction_events,
            )
        return await self._write_new_trd(
            use_case_actors=use_case_actors,
            original_user_requirement=user_requirements,
            available_external_interfaces=available_external_interfaces,
            legacy_trd=previous_version_trd,
            evaluation_conclusion=evaluation_conclusion,
            interaction_events=interaction_events,
        )

    @retry(
        wait=wait_random_exponential(min=1, max=20),
        stop=stop_after_attempt(6),
        after=general_after_log(logger),
    )
    async def _write_new_trd(
        self,
        *,
        use_case_actors: str,
        original_user_requirement: str,
        available_external_interfaces: str,
        legacy_trd: str,
        evaluation_conclusion: str,
        interaction_events: str,
    ) -> str:
        prompt = NEW_PROMPT.format(
            use_case_actors=use_case_actors,
            original_user_requirement=to_markdown_code_block(
                val=original_user_requirement
            ),
            available_external_interfaces=available_external_interfaces,
            legacy_trd=to_markdown_code_block(val=legacy_trd),
            evaluation_conclusion=evaluation_conclusion,
            interaction_events=interaction_events,
        )
        return await self.llm.aask(prompt)

    @retry(
        wait=wait_random_exponential(min=1, max=20),
        stop=stop_after_attempt(6),
        after=general_after_log(logger),
    )
    async def _write_incremental_trd(
        self,
        *,
        use_case_actors: str,
        legacy_user_requirements: str,
        available_external_interfaces: str,
        legacy_user_requirements_trd: str,
        legacy_user_requirements_interaction_events: str,
        incremental_user_requirements: str,
        previous_version_trd: str,
        evaluation_conclusion: str,
        incremental_user_requirements_interaction_events: str,
    ):
        prompt = INCREMENTAL_PROMPT.format(
            use_case_actors=use_case_actors,
            legacy_user_requirements=to_markdown_code_block(
                val=legacy_user_requirements
            ),
            available_external_interfaces=available_external_interfaces,
            legacy_user_requirements_trd=to_markdown_code_block(
                val=legacy_user_requirements_trd
            ),
            legacy_user_requirements_interaction_events=legacy_user_requirements_interaction_events,
            incremental_user_requirements=to_markdown_code_block(
                val=incremental_user_requirements
            ),
            previous_version_trd=to_markdown_code_block(val=previous_version_trd),
            evaluation_conclusion=evaluation_conclusion,
            incremental_user_requirements_interaction_events=incremental_user_requirements_interaction_events,
        )
        return await self.llm.aask(prompt)


NEW_PROMPT = '\n## Actor, System, External System\n{use_case_actors}\n\n## User Requirements\n{original_user_requirement}\n\n## Available External Interfaces\n{available_external_interfaces}\n\n## Legacy TRD\n{legacy_trd}\n\n## Evaluation Conclusion\n{evaluation_conclusion}\n\n## Interaction Events\n{interaction_events}\n\n---\nYou are a TRD generator.\nThe content of "Actor, System, External System" provides an explanation of actors and systems that appear in UML Use Case diagram;\nThe content of "Available External Interfaces" provides the candidate steps, along with the inputs and outputs of each step;\n"User Requirements" provides the original requirements description, any parts not mentioned in this description will be handled by other modules, so do not fabricate requirements;\n"Legacy TRD" provides the old version of the TRD based on the "User Requirements" and can serve as a reference for the new TRD;\n"Evaluation Conclusion" provides a summary of the evaluation of the old TRD in the "Legacy TRD" and can serve as a reference for the new TRD;\n"Interaction Events" provides some identified interaction events and the interacting participants based on the content of the "User Requirements";\n1. What inputs and outputs are described in the "User Requirements"?\n2. How many steps are needed to achieve the inputs and outputs described in the "User Requirements"? Which actors from the "Actor, System, External System" section are involved in each step? What are the inputs and outputs of each step? Where is this output used, for example, as input for which interface or where it is required in the requirements, etc.?\n3. Output a complete Technical Requirements Document (TRD)：\n  3.1. In the description, use the actor and system names defined in the "Actor, System, External System" section to describe the interactors;\n  3.2. The content should include the original text of the requirements from "User Requirements";\n  3.3. In the TRD, each step can involve a maximum of two participants. If there are more than two participants, the step needs to be further split;\n  3.4. In the TRD, each step must include detailed descriptions, inputs, outputs, participants, initiator, and the rationale for the step\'s existence. The rationale should reference the original text to justify it, such as specifying which interface requires the output of this step as parameters or where in the requirements this step is mandated, etc.;\n  3.5. In the TRD, if you need to call interfaces of external systems, you must explicitly specify the interface IDs of the external systems you want to call;\n'

INCREMENTAL_PROMPT = '\n## Actor, System, External System\n{use_case_actors}\n\n## Legacy User Requirements\n{legacy_user_requirements}\n\n## Available External Interfaces\n{available_external_interfaces}\n\n## The TRD of Legacy User Requirements\n{legacy_user_requirements_trd}\n\n\n## The Interaction Events of Legacy User Requirements\n{legacy_user_requirements_interaction_events}\n\n## Incremental Requirements\n{incremental_user_requirements}\n\n## Legacy TRD\n{previous_version_trd}\n\n## Evaluation Conclusion\n{evaluation_conclusion}\n\n## Interaction Events\n{incremental_user_requirements_interaction_events}\n\n---\nYou are a TRD generator.\nThe content of "Actor, System, External System" provides an explanation of actors and systems that appear in UML Use Case diagram;\nThe content of "Available External Interfaces" provides the candidate steps, along with the inputs and outputs of each step;\n"Legacy User Requirements" provides the original requirements description handled by other modules for your use;\n"The TRD of Legacy User Requirements" is the TRD generated by other modules based on the "Legacy User Requirements" for your use;\n"The Interaction Events of Legacy User Requirements" is the interaction events list generated by other modules based on the "Legacy User Requirements" for your use;\n"Incremental Requirements" provides the original requirements description that you need to address, any parts not mentioned in this description will be handled by other modules, so do not fabricate requirements;\nThe requirements in "Legacy User Requirements" combined with the "Incremental Requirements" form a complete set of requirements, therefore, you need to add the TRD portion of the "Incremental Requirements" to "The TRD of Legacy User Requirements", the added content must not conflict with the original content of "The TRD of Legacy User Requirements";\n"Legacy TRD" provides the old version of the TRD you previously wrote based on the "Incremental Requirements" and can serve as a reference for the new TRD;\n"Evaluation Conclusion" provides a summary of the evaluation of the old TRD you generated in the "Legacy TRD", and the identified issues can serve as a reference for the new TRD you create;\n"Interaction Events" provides some identified interaction events and the interacting participants based on the content of the "Incremental Requirements";\n1. What inputs and outputs are described in the "Incremental Requirements"？\n2. How many steps are needed to achieve the inputs and outputs described in the "Incremental Requirements"? Which actors from the "Actor, System, External System" section are involved in each step? What are the inputs and outputs of each step? Where is this output used, for example, as input for which interface or where it is required in the requirements, etc.?\n3. Output a complete Technical Requirements Document (TRD)：\n  3.1. In the description, use the actor and system names defined in the "Actor, System, External System" section to describe the interactors;\n  3.2. The content should include the original text of the requirements from "User Requirements";\n  3.3. In the TRD, each step can involve a maximum of two participants. If there are more than two participants, the step needs to be further split;\n  3.4. In the TRD, each step must include detailed descriptions, inputs, outputs, participants, initiator, and the rationale for the step\'s existence. The rationale should reference the original text to justify it, such as specifying which interface requires the output of this step as parameters or where in the requirements this step is mandated, etc.\n    '

"\n@Time    : 2024/6/13\n@Author  : mashenquan\n@File    : compress_external_interfaces.py\n@Desc    : The implementation of Chapter 2.1.5 of RFC243. https://deepwisdom.feishu.cn/wiki/QobGwPkImijoyukBUKHcrYetnBb\n"


@register_tool(include_functions=["run"])
class CompressExternalInterfaces(Action):
    """CompressExternalInterfaces deal with the following situations:
    1. Given a natural text of acknowledgement, it extracts and compresses the information about external system interfaces.
    """

    @retry(
        wait=wait_random_exponential(min=1, max=20),
        stop=stop_after_attempt(6),
        after=general_after_log(logger),
    )
    async def run(self, *, acknowledge: str) -> str:
        """
                Extracts and compresses information about external system interfaces from a given acknowledgement text.

                Args:
                    acknowledge (str): A natural text of acknowledgement containing details about external system interfaces.

                Returns:
                    str: A compressed version of the information about external system interfaces.

                Example:
                    >>> compress_acknowledge = CompressExternalInterfaces()
                    >>> acknowledge = "## Interfaces\\n..."
                    >>> available_external_interfaces = await compress_acknowledge.run(acknowledge=acknowledge)
                    >>> print(available_external_interfaces)
                    ```json
        [
        {
        "id": 1,
        "inputs": {...
        """
        return await self.llm.aask(
            msg=acknowledge,
            system_msgs=[
                "Extracts and compresses the information about external system interfaces.",
                'Return a markdown JSON list of objects, each object containing:\n- an "id" key containing the interface id;\n- an "inputs" key containing a dict of input parameters that consist of name and description pairs;\n- an "outputs" key containing a dict of returns that consist of name and description pairs;\n',
            ],
        )


"\n@Time    : 2024/6/13\n@Author  : mashenquan\n@File    : detect_interaction.py\n@Desc    : The implementation of Chapter 2.1.6 of RFC243. https://deepwisdom.feishu.cn/wiki/QobGwPkImijoyukBUKHcrYetnBb\n"


@register_tool(include_functions=["run"])
class DetectInteraction(Action):
    """DetectInteraction deal with the following situations:
    1. Given a natural text of user requirements, it identifies the interaction events and the participants of those interactions from the original text.
    """

    @retry(
        wait=wait_random_exponential(min=1, max=20),
        stop=stop_after_attempt(6),
        after=general_after_log(logger),
    )
    async def run(
        self,
        *,
        user_requirements: str,
        use_case_actors: str,
        legacy_interaction_events: str,
        evaluation_conclusion: str,
    ) -> str:
        """
        Identifies interaction events and participants from the user requirements.

        Args:
            user_requirements (str): A natural language text detailing the user's requirements.
            use_case_actors (str): A description of the actors involved in the use case.
            legacy_interaction_events (str): The previous version of the interaction events identified by you.
            evaluation_conclusion (str): The external evaluation conclusions regarding the interactions events identified by you.

        Returns:
            str: A string summarizing the identified interaction events and their participants.

        Example:
            >>> detect_interaction = DetectInteraction()
            >>> user_requirements = "User requirements 1. ..."
            >>> use_case_actors = "- Actor: game player;\\n- System: snake game; \\n- External System: game center;"
            >>> previous_version_interaction_events = "['interaction ...', ...]"
            >>> evaluation_conclusion = "Issues: ..."
            >>> interaction_events = await detect_interaction.run(
            >>>    user_requirements=user_requirements,
            >>>    use_case_actors=use_case_actors,
            >>>    legacy_interaction_events=previous_version_interaction_events,
            >>>    evaluation_conclusion=evaluation_conclusion,
            >>> )
            >>> print(interaction_events)
            "['interaction ...', ...]"
        """
        msg = PROMPT.format(
            use_case_actors=use_case_actors,
            original_user_requirements=to_markdown_code_block(val=user_requirements),
            previous_version_of_interaction_events=legacy_interaction_events,
            the_evaluation_conclusion_of_previous_version_of_trd=evaluation_conclusion,
        )
        return await self.llm.aask(msg=msg)


PROMPT = '\n## Actor, System, External System\n{use_case_actors}\n\n## User Requirements\n{original_user_requirements}\n\n## Legacy Interaction Events\n{previous_version_of_interaction_events}\n\n## Evaluation Conclusion\n{the_evaluation_conclusion_of_previous_version_of_trd}\n\n---\nYou are a tool for capturing interaction events.\n"Actor, System, External System" provides the possible participants of the interaction event;\n"Legacy Interaction Events" is the contents of the interaction events that you output earlier;\nSome descriptions in the "Evaluation Conclusion" relate to the content of "User Requirements", and these descriptions in the "Evaluation Conclusion" address some issues regarding the content of "Legacy Interaction Events";\nYou need to capture the interaction events occurring in the description within the content of "User Requirements" word-for-word, including:\n1. Who is interacting with whom. An interaction event has a maximum of 2 participants. If there are multiple participants, it indicates that multiple events are combined into one event and should be further split;\n2. When an interaction event occurs, who is the initiator? What data did the initiator enter?\n3. What data does the interaction event ultimately return according to the "User Requirements"?\n\nYou can check the data flow described in the "User Requirements" to see if there are any missing interaction events;\nReturn a markdown JSON object list, each object of the list containing:\n- a "name" key containing the name of the interaction event;\n- a "participants" key containing a string list of the names of the two participants;\n- a "initiator" key containing the name of the participant who initiate the interaction;\n- a "input" key containing a natural text description about the input data;\n'

"\n@Time    : 2024/6/13\n@Author  : mashenquan\n@File    : evaluate_trd.py\n@Desc    : The implementation of Chapter 2.1.6~2.1.7 of RFC243. https://deepwisdom.feishu.cn/wiki/QobGwPkImijoyukBUKHcrYetnBb\n"


@register_tool(include_functions=["run"])
class EvaluateTRD(EvaluateAction):
    """EvaluateTRD deal with the following situations:
    1. Given a TRD, evaluates the quality and returns a conclusion.
    """

    async def run(
        self,
        *,
        user_requirements: str,
        use_case_actors: str,
        trd: str,
        interaction_events: str,
        legacy_user_requirements_interaction_events: str = "",
    ) -> EvaluationData:
        """
               Evaluates the given TRD based on user requirements, use case actors, interaction events, and optionally external legacy interaction events.

               Args:
                   user_requirements (str): The requirements provided by the user.
                   use_case_actors (str): The actors involved in the use case.
                   trd (str): The TRD (Technical Requirements Document) to be evaluated.
                   interaction_events (str): The interaction events related to the user requirements and the TRD.
                   legacy_user_requirements_interaction_events (str, optional): External legacy interaction events tied to the user requirements. Defaults to an empty string.

               Returns:
                   EvaluationData: The conclusion of the TRD evaluation.

               Example:
                   >>> evaluate_trd = EvaluateTRD()
                   >>> user_requirements = "User requirements 1. ..."
                   >>> use_case_actors = "- Actor: game player;\\n- System: snake game; \\n- External System: game center;"
                   >>> trd = "## TRD\\n..."
                   >>> interaction_events = "['interaction ...', ...]"
                   >>> evaluation_conclusion = "Issues: ..."
                   >>> legacy_user_requirements_interaction_events = ["user requirements 1. ...", ...]
                   >>> evaluation = await evaluate_trd.run(
                   >>>    user_requirements=user_requirements,
                   >>>    use_case_actors=use_case_actors,
                   >>>    trd=trd,
                   >>>    interaction_events=interaction_events,
                   >>>    legacy_user_requirements_interaction_events=str(legacy_user_requirements_interaction_events),
                   >>> )
                   >>> is_pass = evaluation.is_pass
                   >>> print(is_pass)
                   True
                   >>> evaluation_conclusion = evaluation.conclusion
                   >>> print(evaluation_conclusion)
                   ## Conclustion
        balabalabala...

        """
        prompt = PROMPT.format(
            use_case_actors=use_case_actors,
            user_requirements=to_markdown_code_block(val=user_requirements),
            trd=to_markdown_code_block(val=trd),
            legacy_user_requirements_interaction_events=legacy_user_requirements_interaction_events,
            interaction_events=interaction_events,
        )
        return await self._vote(prompt)


PROMPT = '\n## Actor, System, External System\n{use_case_actors}\n\n## User Requirements\n{user_requirements}\n\n## TRD Design\n{trd}\n\n## External Interaction Events\n{legacy_user_requirements_interaction_events}\n\n## Interaction Events\n{legacy_user_requirements_interaction_events}\n{interaction_events}\n\n---\nYou are a tool to evaluate the TRD design.\n"Actor, System, External System" provides the all possible participants in interaction events;\n"User Requirements" provides the original requirements description, any parts not mentioned in this description will be handled by other modules, so do not fabricate requirements;\n"External Interaction Events" is provided by an external module for your use, its content is also referred to "Interaction Events" section; The content in "External Interaction Events" can be determined to be problem-free;\n"External Interaction Events" provides some identified interaction events and the interacting participants based on the part of the content of the "User Requirements";\n"Interaction Events" provides some identified interaction events and the interacting participants based on the content of the "User Requirements";\n"TRD Design" provides a comprehensive design of the implementation steps for the original requirements, incorporating the interaction events from "Interaction Events" and adding additional steps to connect the complete upstream and downstream data flows;\nIn order to integrate the full upstream and downstream data flow, the "TRD Design" allows for the inclusion of steps that do not appear in the original requirements description, but do not conflict with those explicitly described in the "User Requirements";\nWhich interactions from "Interaction Events" correspond to which steps in "TRD Design"? Please provide reasons.\nWhich aspects of "TRD Design" and "Interaction Events" do not align with the descriptions in "User Requirements"? Please provide detailed descriptions and reasons.\nIf the descriptions in "User Requirements" are divided into multiple steps in "TRD Design" and "Interaction Events," it can be considered compliant with the descriptions in "User Requirements" as long as it does not conflict with them;\nThere is a possibility of missing details in the descriptions of "User Requirements". Any additional steps in "TRD Design" and "Interaction Events" are considered compliant with "User Requirements" as long as they do not conflict with the descriptions provided in "User Requirements";\nIf there are interaction events with external systems in "TRD Design", you must explicitly specify the ID of the external interface to use for the interaction events, the input and output parameters of the used external interface must explictly match the input and output of the interaction event；\nDoes the sequence of steps in "Interaction Events" cause performance or cost issues? Please provide detailed descriptions and reasons;\nIf each step of "TRD Design" has input data, its input data is provided either by the output of the previous steps or by participants of "Actor, System, External System", and there should be no passive data;\nReturn a markdown JSON object with:\n- an "issues" key containing a string list of natural text about the issues that need to be addressed, found in the "TRD Design" if any exist, each issue found must provide a detailed description and include reasons;\n- a "conclusion" key containing the evaluation conclusion;\n- a "correspondence_between" key containing the judgement detail of the natural text string list about the correspondence between "Interaction Events" and "TRD Design" steps;\n- a "misalignment" key containing the judgement detail of the natural text string list about the misalignment with "User Requirements";\n- a "is_pass" key containing a true boolean value if there is not any issue in the "TRD Design";\n'
