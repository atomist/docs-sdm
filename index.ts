/*
 * Copyright © 2019 Atomist, Inc.
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

import { configureHumio } from "@atomist/automation-client-ext-humio";
import { configureLogzio } from "@atomist/automation-client-ext-logzio";
import {
    CacheConfiguration,
    SoftwareDeliveryMachineConfiguration,
} from "@atomist/sdm";
import {
    ConfigureOptions,
    configureSdm,
} from "@atomist/sdm-core";
import { machine } from "./lib/machine/machine";

const machineOptions: ConfigureOptions = {
    requiredConfigurationValues: [
    ],
};

// Main configuration entry point for this SDM
export const configuration: SoftwareDeliveryMachineConfiguration<CacheConfiguration> = {
    logging: {
        level: "info",
    },
    postProcessors: [
        configureHumio,
        configureLogzio,
        configureSdm(machine, machineOptions),
    ],
    sdm: {
        cache: {
            enabled: true,
            path: "/opt/data",
        },
    },
};
