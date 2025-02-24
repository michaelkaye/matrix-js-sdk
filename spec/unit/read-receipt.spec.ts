/*
Copyright 2022 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import MockHttpBackend from 'matrix-mock-request';

import { ReceiptType } from '../../src/@types/read_receipts';
import { MatrixClient } from "../../src/client";
import { IHttpOpts } from '../../src/http-api';
import { EventType } from '../../src/matrix';
import { MAIN_ROOM_TIMELINE } from '../../src/models/read-receipt';
import { encodeUri } from '../../src/utils';
import * as utils from "../test-utils/test-utils";

// Jest now uses @sinonjs/fake-timers which exposes tickAsync() and a number of
// other async methods which break the event loop, letting scheduled promise
// callbacks run. Unfortunately, Jest doesn't expose these, so we have to do
// it manually (this is what sinon does under the hood). We do both in a loop
// until the thing we expect happens: hopefully this is the least flakey way
// and avoids assuming anything about the app's behaviour.
const realSetTimeout = setTimeout;
function flushPromises() {
    return new Promise(r => {
        realSetTimeout(r, 1);
    });
}

let client: MatrixClient;
let httpBackend: MockHttpBackend;

const THREAD_ID = "$thread_event_id";
const ROOM_ID = "!123:matrix.org";

const threadEvent = utils.mkEvent({
    event: true,
    type: EventType.RoomMessage,
    user: "@bob:matrix.org",
    room: ROOM_ID,
    content: {
        "body": "Hello from a thread",
        "m.relates_to": {
            "event_id": THREAD_ID,
            "m.in_reply_to": {
                "event_id": THREAD_ID,
            },
            "rel_type": "m.thread",
        },
    },
});

const roomEvent = utils.mkEvent({
    event: true,
    type: EventType.RoomMessage,
    user: "@bob:matrix.org",
    room: ROOM_ID,
    content: {
        "body": "Hello from a room",
    },
});

function mockServerSideSupport(client, hasServerSideSupport) {
    const doesServerSupportUnstableFeature = client.doesServerSupportUnstableFeature;
    client.doesServerSupportUnstableFeature = (unstableFeature) => {
        if (unstableFeature === "org.matrix.msc3771") {
            return Promise.resolve(hasServerSideSupport);
        } else {
            return doesServerSupportUnstableFeature(unstableFeature);
        }
    };
}

describe("Read receipt", () => {
    beforeEach(() => {
        httpBackend = new MockHttpBackend();
        client = new MatrixClient({
            baseUrl: "https://my.home.server",
            accessToken: "my.access.token",
            request: httpBackend.requestFn as unknown as IHttpOpts["request"],
        });
        client.isGuest = () => false;
    });

    describe("sendReceipt", () => {
        it("sends a thread read receipt", async () => {
            httpBackend.when(
                "POST", encodeUri("/rooms/$roomId/receipt/$receiptType/$eventId", {
                    $roomId: ROOM_ID,
                    $receiptType: ReceiptType.Read,
                    $eventId: threadEvent.getId(),
                }),
            ).check((request) => {
                expect(request.data.thread_id).toEqual(THREAD_ID);
            }).respond(200, {});

            mockServerSideSupport(client, true);
            client.sendReceipt(threadEvent, ReceiptType.Read, {});

            await httpBackend.flushAllExpected();
            await flushPromises();
        });

        it("sends a room read receipt", async () => {
            httpBackend.when(
                "POST", encodeUri("/rooms/$roomId/receipt/$receiptType/$eventId", {
                    $roomId: ROOM_ID,
                    $receiptType: ReceiptType.Read,
                    $eventId: roomEvent.getId(),
                }),
            ).check((request) => {
                expect(request.data.thread_id).toEqual(MAIN_ROOM_TIMELINE);
            }).respond(200, {});

            mockServerSideSupport(client, true);
            client.sendReceipt(roomEvent, ReceiptType.Read, {});

            await httpBackend.flushAllExpected();
            await flushPromises();
        });

        it("sends a room read receipt when there's no server support", async () => {
            httpBackend.when(
                "POST", encodeUri("/rooms/$roomId/receipt/$receiptType/$eventId", {
                    $roomId: ROOM_ID,
                    $receiptType: ReceiptType.Read,
                    $eventId: threadEvent.getId(),
                }),
            ).check((request) => {
                expect(request.data.thread_id).toBeUndefined();
            }).respond(200, {});

            mockServerSideSupport(client, false);
            client.sendReceipt(threadEvent, ReceiptType.Read, {});

            await httpBackend.flushAllExpected();
            await flushPromises();
        });
    });
});
