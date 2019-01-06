/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    Autofix,
    createGoal,
    Fingerprint,
    goals,
    PushTest,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
} from "@atomist/sdm";
import {
    createSoftwareDeliveryMachine,
    gitHubGoalStatus,
    goalState,
} from "@atomist/sdm-core";
import { Build } from "@atomist/sdm-pack-build";
import { mkdocsBuilderRegistration } from "./../build/mkdocsBuilder";
import {
    AlphabetizeGlossaryAutofix,
    AlphabetizeGlossaryCommand,
} from "./alphabetizeGlossary";
import {
    listTodoCodeInspectionRegistration,
} from "./listTodoCommand";
import { MkdocsSiteGenerator } from "./mkdocsGenerator";
import { executeMkdocsStrict } from "./mkdocsStrict";
import {
    TbdFingerprinterRegistration,
    tbdFingerprintListener,
} from "./tbdFingerprinter";
import { removeTodoTransformRegistration } from './removeTodos';
import { createIssueForTodos } from "./todoToIssue";

export function machine(
    configuration: SoftwareDeliveryMachineConfiguration,
): SoftwareDeliveryMachine {

    const sdm = createSoftwareDeliveryMachine({
        name: "Atomist Documentation Software Delivery Machine",
        configuration,
    });

    sdm.addCodeTransformCommand(AlphabetizeGlossaryCommand);
    sdm.addCodeTransformCommand(removeTodoTransformRegistration);

    sdm.addCodeInspectionCommand(listTodoCodeInspectionRegistration());
    sdm.addCodeInspectionCommand(createIssueForTodos)

    const autofix = new Autofix().with(AlphabetizeGlossaryAutofix);

    const fingerprint = new Fingerprint().with(TbdFingerprinterRegistration)
        .withListener(tbdFingerprintListener);

    const build = new Build("mkdocs build")
        .with(mkdocsBuilderRegistration());

    const strictMkdocsBuild = createGoal(
        { displayName: "mkdocs strict" },
        executeMkdocsStrict);

    const mkDocsGoals = goals("mkdocs")
        .plan(autofix, fingerprint)
        .plan(build).after(autofix)
        .plan(strictMkdocsBuild).after(build);

    // sdm.withPushRules(
    //     whenPushSatisfies(IsMkdocsProject)
    //         .setGoals(mkDocsGoals),
    // );

    sdm.addGeneratorCommand(MkdocsSiteGenerator);

    sdm.addExtensionPacks(
        goalState(),
        gitHubGoalStatus(),
    );

    return sdm;
}

const IsMkdocsProject: PushTest = {
    name: "IsMkdocsProject",
    mapping: inv => inv.project.hasFile("mkdocs.yml"),
};
