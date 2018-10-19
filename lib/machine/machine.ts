import { TbdFingerprinterRegistration, tbdFingerprintListener } from './tbdFingerprinter';
import {
    PutTbdInEmptySectionsAutofix,
    PutTbdInEmptySectionsCommand,
} from "./emptySectionsContainTbd";
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
    DoNotSetAnyGoals,
    Fingerprint,
    goalContributors,
    goals,
    onAnyPush,
    pushTest,
    PushTest,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    createSoftwareDeliveryMachine,
} from "@atomist/sdm-core";

export function machine(
    configuration: SoftwareDeliveryMachineConfiguration,
): SoftwareDeliveryMachine {

    const sdm = createSoftwareDeliveryMachine({
        name: "Atomist Documentation Software Delivery Machine",
        configuration,
    });

    sdm.addCodeTransformCommand(PutTbdInEmptySectionsCommand);

    const autofix = new Autofix().with(PutTbdInEmptySectionsAutofix);

    const fingerprint = new Fingerprint().with(TbdFingerprinterRegistration)
        .withListener(tbdFingerprintListener);

    const mkDocsGoals = goals("mkdocs").plan(autofix, fingerprint);

    sdm.addGoalContributions(goalContributors(
        whenPushSatisfies(IsMkdocsProject)
            .setGoals(mkDocsGoals),
        onAnyPush().setGoals(DoNotSetAnyGoals),
    ));
    return sdm;
}

const IsMkdocsProject: PushTest = {
    name: "IsMkdocsProject",
    mapping: inv => inv.project.hasFile("mkdocs.yml"),
};
