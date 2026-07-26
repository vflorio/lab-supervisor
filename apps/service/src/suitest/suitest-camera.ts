import type * as Predicates from "@supervisor/core/predicates/index";
import * as Suitest from "@supervisor/core/services/suitest";

// -------------------------------------------------------------------------------------
// Suitest video-capture-device tracker - dominio "suitest-camera": online/recording/stream
// -------------------------------------------------------------------------------------

export const DOMAIN = "suitest-camera";

const keyOf = (item: Suitest.VideoCaptureDevice): string => item.id;

const toFacts = (item: Suitest.VideoCaptureDevice): Readonly<Record<string, Predicates.PredicateValue>> => ({
  suitest_camera_connected: item.online,
  suitest_camera_recording: item.recordingActive,
  suitest_camera_streaming: item.streamActive,
});

export const trackerConfig: Predicates.TrackerConfig<Suitest.Env, Suitest.SuitestError, Suitest.VideoCaptureDevice> = {
  domain: DOMAIN,
  keyOf,
  toFacts,
  fetch: Suitest.getVideoCaptureDevices,
};
