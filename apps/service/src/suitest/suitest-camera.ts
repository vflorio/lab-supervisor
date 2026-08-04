import * as Suitest from "@supervisor/core/adapters/suitest";
import type * as Facts from "@supervisor/core/fact/index";

// Suitest video-capture-device tracker - dominio "suitest-camera": online/recording/stream
export const DOMAIN = "suitest-camera";

const keyOf = (item: Suitest.VideoCaptureDevice): string => item.id;

const toFacts = (item: Suitest.VideoCaptureDevice): Readonly<Record<string, Facts.FactValue>> => ({
  suitest_camera_connected: item.online,
  suitest_camera_recording: item.recordingActive,
  suitest_camera_streaming: item.streamActive,
});

export const trackerConfig: Facts.TrackerConfig<Suitest.Env, Suitest.SuitestError, Suitest.VideoCaptureDevice> = {
  domain: DOMAIN,
  keyOf,
  toFacts,
  fetch: Suitest.getVideoCaptureDevices,
};
