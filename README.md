# Lab Supervisor

A central recovery service running on the Lab Mac mini is proposed to continuously monitor the Lab infrastructure and automatically recover TVs, Candyboxes (Raspberry Pi IR bridges), and Android camera devices whenever possible.

The goal is to minimize manual intervention by detecting failures, executing automated recovery workflows, and notifying the team only when manual action is required.

---

## Functional Requirements

### Monitoring
The service must continuously monitor:

- TVs / Candyboxes
- Android camera stream availability
Monitoring must only be active during a configurable working schedule (e.g. Monday–Friday, 09:00–18:00) to avoid powering on or recovering devices outside business hours.

---

### Recovery Policies
Each monitored device type must support configurable recovery policies.

Example configuration:

- Candybox: trigger recovery after **1 minute** offline, or when multiple devices that are owned by a candybox become offlines altogether
- Android camera: trigger recovery after **3 minutes** without camera being available for stream
The grace period before starting recovery must be configurable per device type.

---

### Recovery Workflows
When a monitored device exceeds its configured offline threshold, the service must:

1. Detect the failure
2. Wait for the configured grace period
3. Execute the appropriate recovery strategy
4. Verify that the device becomes operational again
Supported recovery actions include:

#### Candyboxes

- Reboot the control unit through the Suitest Public API, when that unit supports it
- Verify the device becomes reachable again

#### Android Cameras

- Connect through ADB over TCP
- Restart the Suites app if needed
- Reboot the device for catastrophic errors
- Start the suitest & Automation application after boot
- Verify that the video stream becomes available again
Android devices should automatically expose ADB over TCP on a predefined port after boot.

---

### Retry Policies
Recovery actions must support configurable retry policies.

Examples:

- Number of recovery attempts
- Delay between attempts
- Different retry strategies depending on device type

---

### Notifications
Slack notifications should only be sent when:

- a recovery workflow fails after all configured retry attempts, or
- an immediately critical failure occurs (configurable policy).
Notifications should include enough diagnostic information to simplify manual investigation.

---

### Operational Constraints
The recovery service **must not operate smart plugs**.

Manual power-offs performed for maintenance must never be overridden automatically.

The Mac mini recovery service must include an health-check mechanism that automatically restarts the service process if it becomes unresponsive. (Maybe PM2 or Docker)

---

## Acceptance Criteria

- Continuously monitor TVs, Candyboxes and Android camera streams.
- Monitoring is active only during a configurable schedule (e.g. Mon–Fri, 09:00–18:00).
- Device-specific offline thresholds are configurable.
- Recovery workflows are executed automatically after the configured timeout.
- Android recovery uses ADB over TCP.
- Recovery retries are configurable.
- Recovery success is verified before considering the device healthy.
- Slack notifications are sent only after recovery attempts are exhausted (or immediately for critical failures if configured).
- Smart plugs are never controlled by the service.
- The Mac mini service automatically restarts if its process becomes unresponsive.

---

## Nice to Have

### Scheduled TV Recording Sessions
The application could provide a scheduling interface allowing users to automate TV recording sessions.

Example workflow:

A user schedules a session from **10:00 to 12:00**.

At the scheduled time, the service automatically:

- powers on the target TV/device
- selects the desired TV input/channel (via IR/Candybox)
- starts screen recording
- records for the configured duration
- stores the recording
- optionally powers off the setup at the end of the session
This feature would enable unattended recordings for demos, regression testing, or monitoring purposes.

---

## Other Information
The only hardware write operation [Suitest](http://the.suite.st/) exposes is rebooting a control unit
(`POST /control-units/{id}/reboot`, Public API v4), and only for units that report `reboot: true`.

There is no power on, no power off, and no command of any kind towards a TV. Anything the Public API does
not cover will go through a smart plug instead; that channel is not part of the current scope.

---