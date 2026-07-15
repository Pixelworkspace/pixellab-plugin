"use strict";
(() => {
  // src/config.ts
  var BASE_DEFAULT = "https://api.pixellab.ai/v2";
  var TABS = ["generate", "animate", "repaint", "jobs", "settings"];
  var JOBS_TAB = TABS.indexOf("jobs");
  var SIZES = [32, 64, 128, 256];
  var FRAME_COUNTS = [4, 8, 16];
  var generateCost = () => 20;
  var animateCost = (frameCount) => Math.max(1, Math.round(frameCount / 4));

  // src/state.ts
  var ui = {
    // Land on Settings the first time (no API key yet) so the key field is right there.
    tab: px.storage.get("apiKey") ? 0 : TABS.indexOf("settings"),
    error: "",
    preview: null,
    balance: null,
    detailJob: null
  };

  // src/storage.ts
  function getSettings() {
    return {
      apiKey: px.storage.get("apiKey") || "",
      baseUrl: px.storage.get("baseUrl") || BASE_DEFAULT,
      size: px.storage.get("size") || 128,
      noBg: px.storage.get("noBg") !== false,
      // default on
      description: px.storage.get("description") || "",
      repaintDesc: px.storage.get("repaintDesc") || "",
      action: px.storage.get("action") || "",
      frameCount: px.storage.get("frameCount") || 8,
      inputSource: px.storage.get("inputSource") === "group" ? "group" : "cel",
      inputFrame: px.storage.get("inputFrame") || 0,
      inputGroup: px.storage.get("inputGroup") || "",
      lastFrame: px.storage.get("lastFrame") == null ? -1 : px.storage.get("lastFrame"),
      enhance: px.storage.get("enhance") === true,
      seed: px.storage.get("seed") || ""
    };
  }
  function authHeader() {
    return { Authorization: "Bearer " + getSettings().apiKey };
  }
  function nextSeq() {
    const n = (px.storage.get("seq") || 0) + 1;
    px.storage.set("seq", n);
    return n;
  }

  // src/api.ts
  async function submit(path, req) {
    const s = getSettings();
    const start = await px.http.post(s.baseUrl + path, req, { headers: authHeader() });
    if (!start.ok) throw new Error("API error " + start.status + ": " + start.body.slice(0, 200));
    return start.json();
  }
  function jobIdOf(body) {
    const id = body.background_job_id || body.id;
    if (!id) throw new Error("No job id in response.");
    return id;
  }
  async function poll(jobId, label = "Generating") {
    const s = getSettings();
    px.ui.progress(null, "Waiting\u2026");
    for (let i = 0; i < 80; i++) {
      await px.sleep(3e3);
      const r = await px.http.get(s.baseUrl + "/background-jobs/" + jobId, { headers: authHeader() });
      const d = r.json();
      const lr = d.last_response || {};
      const st = d.status || d.state || lr.status;
      let p = typeof lr.progress === "number" ? lr.progress : typeof d.progress === "number" ? d.progress : null;
      if (p != null) {
        if (p > 1) p = p / 100;
        px.ui.progress(p, label);
      } else {
        px.ui.progress(null, "Waiting\u2026" + (lr.queue_position ? " (queue " + lr.queue_position + ")" : ""));
      }
      if (st === "completed" || st === "succeeded" || st === "success") {
        px.ui.progress(1, "Done");
        return d;
      }
      if (st === "failed" || st === "error" || st === "cancelled") {
        throw new Error("Generation failed: " + JSON.stringify(d).slice(0, 200));
      }
    }
    throw new Error("Timed out waiting for the job");
  }
  async function checkBalance() {
    const s = getSettings();
    const r = await px.http.get(s.baseUrl + "/balance", { headers: authHeader() });
    const d = r.json();
    const usd = d?.credits?.usd != null ? d.credits.usd : d?.usd != null ? d.usd : null;
    const sub = d?.subscription ?? null;
    const subRem = sub ? sub.remaining ?? sub.generations ?? sub.credits ?? null : null;
    let out = usd != null ? "$" + usd + " credits" : "\u2014";
    if (subRem != null) out += " \xB7 subscription: " + subRem;
    return out;
  }

  // src/job-store.ts
  var MAX_JOBS = 40;
  function getJobs() {
    const j = px.storage.get("jobs");
    return Array.isArray(j) ? j : [];
  }
  function saveJobs(jobs) {
    px.storage.set("jobs", jobs.slice(-MAX_JOBS));
  }
  function addJob(rec) {
    const jobs = getJobs();
    const job = { seq: nextSeq(), status: "processing", ...rec };
    jobs.push(job);
    saveJobs(jobs);
    return job;
  }
  function updateJob(seq, patch) {
    const jobs = getJobs();
    const j = jobs.find((x) => x.seq === seq);
    if (j) {
      Object.assign(j, patch);
      saveJobs(jobs);
    }
  }
  function removeJob(seq) {
    saveJobs(getJobs().filter((x) => x.seq !== seq));
  }
  function findJob(seq) {
    return getJobs().find((x) => x.seq === seq);
  }
  var thumbs = {};
  function jobThumb(fileKey) {
    return fileKey ? thumbs[fileKey] ?? null : null;
  }
  async function loadThumbs() {
    const recent = getJobs().slice().reverse().slice(0, 16);
    for (const j of recent) {
      if (j.status === "completed" && j.fileKey && !thumbs[j.fileKey]) {
        try {
          const f = await px.files.get(j.fileKey);
          thumbs[j.fileKey] = f.data;
        } catch {
        }
      }
    }
  }

  // src/types/widget-type.ts
  var WidgetType = {
    VStack: "vstack",
    HStack: "hstack",
    Label: "label",
    Text: "text",
    Heading: "heading",
    Button: "button",
    Slider: "slider",
    Input: "input",
    Checkbox: "checkbox",
    Select: "select",
    Color: "color",
    ColorBar: "colorbar",
    Swatches: "swatches",
    Image: "image",
    TextArea: "textarea",
    Progress: "progress",
    Tabs: "tabs",
    Separator: "separator",
    Spacer: "spacer"
  };

  // src/types/action.ts
  var Action = {
    // navigation
    Tab: "tab",
    JobDetail: "jobDetail",
    JobBack: "jobBack",
    GotoSettings: "gotoSettings",
    // settings persistence
    Desc: "desc",
    RepaintDesc: "repaintDesc",
    Size: "size",
    NoBg: "nobg",
    ApiKey: "apiKey",
    BaseUrl: "baseUrl",
    AnimAction: "animAction",
    FrameCount: "frameCount",
    InputSource: "inputSource",
    InputFrame: "inputFrame",
    InputGroup: "inputGroup",
    LastFrame: "lastFrame",
    Enhance: "enhance",
    Seed: "seed",
    // commands
    Generate: "generate",
    Insert: "insert",
    SaveAsset: "saveAsset",
    Repaint: "repaint",
    Animate: "animate",
    Balance: "balance",
    // jobs
    JobInsert: "jobInsert",
    JobAsset: "jobAsset",
    JobResume: "jobResume",
    JobDelete: "jobDelete"
  };

  // src/widgets.ts
  function needsKeyBanner() {
    return [
      { type: WidgetType.Label, text: "\u26A0 No API key set yet." },
      { type: WidgetType.Button, variant: "primary", text: "Go to Settings \u2192", action: Action.GotoSettings },
      { type: WidgetType.Separator }
    ];
  }
  function statusIcon(status) {
    return status === "completed" ? "\u2713" : status === "failed" ? "\u2715" : "\u23F3";
  }

  // src/features/generate.ts
  async function saveGeneration(g, label) {
    const seq = nextSeq();
    const key = "gen/sprite_" + seq + ".png";
    await px.files.put(key, {
      data: g.base64,
      mimeType: "image/png",
      name: (label || "sprite").slice(0, 60),
      meta: {
        request: g.request,
        response: { generations: g.generations, jobId: g.jobId },
        width: g.width,
        height: g.height,
        seq
      }
    });
    return key;
  }
  async function generateImage(description, width, height, kind = "generate") {
    const s = getSettings();
    if (!s.apiKey) throw new Error("No API key yet \u2014 open the Settings tab and paste your Pixellab token.");
    if (!description) throw new Error("Enter a description first.");
    const req = { description, image_size: { width, height }, no_background: s.noBg };
    px.ui.progress(null, "Submitting\u2026");
    const body = await submit("/generate-image-v2", req);
    const jobId = jobIdOf(body);
    const job = addJob({
      kind,
      jobId,
      label: description.slice(0, 60),
      width,
      height,
      request: req,
      enhancedPrompt: body.enhanced_prompt || null,
      enhanceGens: (body.enhance_usage || {}).generations
    });
    try {
      const done = await poll(jobId, kind === "repaint" ? "Repainting" : "Generating sprite");
      const lr = done.last_response || done;
      const images = lr.images || [];
      if (!images.length) throw new Error("No images returned.");
      const generations = (lr.billing_usage || {}).generations;
      const g = { base64: images[0].base64, width, height, generations, request: req, jobId };
      g.key = await saveGeneration(g, description);
      updateJob(job.seq, {
        status: "completed",
        fileKey: g.key,
        generations,
        costIfPaid: (lr.usage || {}).cost_if_paid,
        seed: lr.seed,
        createdAt: done.created_at
      });
      g.jobSeq = job.seq;
      return g;
    } catch (e) {
      updateJob(job.seq, { status: "failed", error: message(e) });
      throw e;
    }
  }
  async function insertPreview(asAsset) {
    if (!ui.preview) throw new Error("Nothing to insert.");
    const img = await px.image.decode(ui.preview.base64);
    const ctx = px.assets.current();
    if (asAsset || !ctx || img.width !== ctx.width || img.height !== ctx.height) {
      const ref = await px.assets.create({
        name: "Pixellab " + (ui.preview.key || "sprite"),
        type: "character",
        width: img.width,
        height: img.height,
        pixels: img.pixels
      });
      px.assets.open(ref.id);
      return "Created asset " + ref.name;
    }
    px.editor.commit(img.pixels);
    return "Inserted into canvas";
  }
  function generateTab() {
    const s = getSettings();
    const kids = [];
    if (!s.apiKey) kids.push(...needsKeyBanner());
    kids.push(
      { type: WidgetType.TextArea, label: "Description", value: s.description, rows: 3, action: Action.Desc, placeholder: "a knight in golden armor holding a sword" },
      {
        type: WidgetType.HStack,
        gap: 8,
        children: [
          { type: WidgetType.Select, label: "Size", value: s.size, action: Action.Size, options: SIZES.map((n) => ({ label: n + "px", value: n })) },
          { type: WidgetType.Checkbox, label: "No background", value: s.noBg, action: Action.NoBg }
        ]
      },
      { type: WidgetType.Label, muted: true, text: "Cost: ~" + generateCost() + " generations" },
      { type: WidgetType.Button, variant: "primary", text: "Generate", action: Action.Generate }
    );
    if (ui.preview) {
      const p = ui.preview;
      kids.push({ type: WidgetType.Separator });
      kids.push({
        type: WidgetType.Image,
        label: "Result (" + p.width + "\xD7" + p.height + (p.generations != null ? ", " + p.generations + " generations" : "") + ")",
        src: p.base64
      });
      kids.push({
        type: WidgetType.HStack,
        gap: 6,
        children: [
          { type: WidgetType.Button, variant: "primary", text: "Insert into canvas", action: Action.Insert },
          { type: WidgetType.Button, text: "Save as asset", action: Action.SaveAsset }
        ]
      });
    }
    return kids;
  }
  function message(e) {
    return (e?.message || String(e)).slice(0, 140);
  }

  // src/features/animate.ts
  async function encodeFrame(index, w, h) {
    px.editor.setFrame(index);
    return px.image.encode(px.editor.pixels(), w, h);
  }
  async function encodeGroup(groupId, w, h) {
    return px.image.encode(px.editor.groupPixels(groupId), w, h);
  }
  function resolveGroupId(groups, saved) {
    if (!groups.length) throw new Error("This document has no layer groups.");
    return saved && groups.some((g) => g.id === saved) ? saved : groups[0].id;
  }
  function toStrip(frames) {
    const fw = frames[0].width;
    const fh = frames[0].height;
    const n = frames.length;
    const strip = new Uint32Array(fw * n * fh);
    for (let i = 0; i < n; i++) {
      const f = frames[i];
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) strip[y * (fw * n) + i * fw + x] = f.pixels[y * fw + x];
    }
    return { pixels: strip, width: fw * n, height: fh };
  }
  async function animate() {
    const s = getSettings();
    if (!s.apiKey) throw new Error("No API key yet \u2014 open the Settings tab.");
    if (!s.action) throw new Error('Enter an action (e.g. "walking", "attacking").');
    const w = px.editor.width();
    const h = px.editor.height();
    const fcount = px.editor.frameCount();
    let firstFrame;
    if (s.inputSource === "group") {
      const gid = resolveGroupId(px.editor.groups(), s.inputGroup);
      firstFrame = await encodeGroup(gid, w, h);
    } else {
      const inputIdx = Math.min(s.inputFrame || 0, fcount - 1);
      firstFrame = await encodeFrame(inputIdx, w, h);
    }
    const req = {
      first_frame: { type: "base64", base64: firstFrame },
      action: s.action,
      frame_count: s.frameCount,
      no_background: s.noBg,
      enhance_prompt: s.enhance
    };
    if (s.seed) req.seed = Number(s.seed);
    if (s.lastFrame === -2) req.last_frame = { type: "base64", base64: firstFrame };
    else if (s.lastFrame >= 0) req.last_frame = { type: "base64", base64: await encodeFrame(Math.min(s.lastFrame, fcount - 1), w, h) };
    px.ui.progress(null, "Submitting\u2026");
    const body = await submit("/animate-with-text-v3", req);
    const jobId = jobIdOf(body);
    const job = addJob({
      kind: "animate",
      jobId,
      label: s.action.slice(0, 60),
      width: w,
      height: h,
      frameCount: s.frameCount,
      request: req,
      enhancedPrompt: body.enhanced_prompt || null,
      enhanceGens: (body.enhance_usage || {}).generations
    });
    try {
      const done = await poll(jobId, "Animating");
      px.ui.progress(null, "Writing frames\u2026");
      const lr = done.last_response || done;
      const images = lr.images || [];
      if (!images.length) throw new Error("No frames returned.");
      const frames = [];
      for (const img of images) frames.push(await px.image.decode(img.base64));
      const n = frames.length;
      const fw = frames[0].width;
      const fh = frames[0].height;
      let wrote = false;
      if (fw === w && fh === h) {
        while (px.editor.frameCount() < n) px.editor.addFrame();
        for (let i = 0; i < n; i++) {
          px.editor.setFrame(i);
          px.editor.commit(frames[i].pixels);
        }
        px.editor.setFrame(0);
        wrote = true;
      }
      const strip = toStrip(frames);
      const key = "anim/" + (s.action.slice(0, 20).replace(/[^a-z0-9]+/gi, "_") || "anim") + "_" + nextSeq() + ".png";
      const gens = (lr.billing_usage || {}).generations;
      await px.files.put(key, {
        data: await px.image.encode(strip.pixels, strip.width, strip.height),
        mimeType: "image/png",
        name: "anim " + s.action,
        meta: { request: req, response: { generations: gens, jobId, frames: n }, width: strip.width, height: strip.height, animation: true, frameW: fw, frameH: fh }
      });
      updateJob(job.seq, { status: "completed", fileKey: key, generations: gens, costIfPaid: (lr.usage || {}).cost_if_paid, seed: lr.seed, createdAt: done.created_at });
      if (wrote) {
        try {
          await px.editor.save();
        } catch {
        }
      }
      return { frames: n, generations: gens, sizeMatch: wrote };
    } catch (e) {
      updateJob(job.seq, { status: "failed", error: message(e) });
      throw e;
    }
  }
  function animateTab() {
    const s = getSettings();
    const fc = px.editor.frameCount();
    const kids = [];
    if (!s.apiKey) kids.push(...needsKeyBanner());
    const isGroup = s.inputSource === "group";
    const groups = px.editor.groups();
    const groupOpts = groups.map((g) => ({ label: g.name + " (" + g.layers.length + " layer" + (g.layers.length === 1 ? "" : "s") + ")", value: g.id }));
    const groupVal = s.inputGroup && groups.some((g) => g.id === s.inputGroup) ? s.inputGroup : groups[0]?.id ?? "";
    const frameOpts = Array.from({ length: fc }, (_, i) => ({ label: "Frame " + (i + 1), value: i }));
    const lastOpts = [
      { label: "\u2014 none \u2014", value: -1 },
      { label: "Loop (= input)", value: -2 },
      ...frameOpts
    ];
    kids.push(
      { type: WidgetType.Text, text: "Animate the current sprite \u2192 timeline frames. Endpoint: animate-with-text-v3." },
      { type: WidgetType.TextArea, label: "Action", value: s.action, rows: 2, action: Action.AnimAction, placeholder: "walking \xB7 attacking \xB7 idle sway (keep it short)" },
      {
        type: WidgetType.Select,
        label: "Input",
        value: s.inputSource,
        action: Action.InputSource,
        options: [
          { label: "Active cel", value: "cel" },
          { label: "Layer group (composited)", value: "group" }
        ]
      },
      {
        type: WidgetType.HStack,
        gap: 8,
        children: [
          { type: WidgetType.Select, label: "Frames", value: s.frameCount, action: Action.FrameCount, options: FRAME_COUNTS.map((n) => ({ label: "" + n, value: n })) },
          isGroup ? {
            type: WidgetType.Select,
            label: "Layer group",
            value: groupVal,
            action: Action.InputGroup,
            options: groupOpts.length ? groupOpts : [{ label: "\u2014 no groups \u2014", value: "" }]
          } : { type: WidgetType.Select, label: "Input frame", value: Math.min(s.inputFrame, Math.max(0, fc - 1)), action: Action.InputFrame, options: frameOpts }
        ]
      },
      { type: WidgetType.Select, label: "Last frame (optional \u2014 for seamless loops)", value: s.lastFrame, action: Action.LastFrame, options: lastOpts },
      {
        type: WidgetType.HStack,
        gap: 8,
        children: [
          { type: WidgetType.Checkbox, label: "Enhance prompt", value: s.enhance, action: Action.Enhance },
          { type: WidgetType.Input, label: "Seed (optional)", inputType: "number", value: s.seed, action: Action.Seed, placeholder: "random" }
        ]
      },
      { type: WidgetType.Checkbox, label: "No background", value: s.noBg, action: Action.NoBg },
      { type: WidgetType.Label, muted: true, text: "Cost: ~" + animateCost(s.frameCount) + " generations (" + s.frameCount + " frames)" },
      { type: WidgetType.Button, variant: "primary", text: "Animate \u2192 timeline", action: Action.Animate }
    );
    return kids;
  }

  // src/features/repaint.ts
  async function runRepaint() {
    const sel = px.editor.getSelection();
    if (!sel) throw new Error("Select a region first.");
    px.editor.setMask([{ x: sel.x, y: sel.y }]);
    try {
      const g = await generateImage(getSettings().repaintDesc, sel.w, sel.h, "repaint");
      const img = await px.image.decode(g.base64);
      px.editor.putRegion(sel.x, sel.y, sel.w, sel.h, img.pixels);
      return "Repainted selection";
    } finally {
      px.editor.clearMask();
    }
  }
  function repaintTab() {
    const s = getSettings();
    const sel = px.editor.getSelection();
    const kids = [];
    if (!s.apiKey) kids.push(...needsKeyBanner());
    kids.push(
      { type: WidgetType.Text, text: "Select a region with the selection tool, describe it, and Pixellab repaints just that area." },
      { type: WidgetType.Label, muted: true, text: sel ? "Selection: " + sel.w + "\xD7" + sel.h + " @ " + sel.x + "," + sel.y : "No selection yet." },
      { type: WidgetType.TextArea, label: "Repaint as", value: s.repaintDesc, rows: 2, action: Action.RepaintDesc, placeholder: "glowing magic rune" },
      { type: WidgetType.Label, muted: true, text: "Cost: ~" + generateCost() + " generations" },
      { type: WidgetType.Button, variant: "primary", text: "Repaint selection", action: Action.Repaint }
    );
    return kids;
  }

  // src/features/jobs.ts
  function jobsTab() {
    const jobs = getJobs().slice().reverse();
    if (!jobs.length) return [{ type: WidgetType.Label, muted: true, text: "No jobs yet \u2014 generations show up here (survives reload)." }];
    const kids = [{ type: WidgetType.Label, muted: true, text: jobs.length + " cached jobs" }];
    for (const j of jobs) {
      const size = j.width ? j.width + "\xD7" + j.height : "";
      const actions = [];
      if (j.status === "completed" && j.fileKey) {
        actions.push({ type: WidgetType.Button, text: j.kind === "animate" ? "Open \u2192timeline" : "Insert", action: Action.JobInsert, value: String(j.seq) });
        if (j.kind !== "animate") actions.push({ type: WidgetType.Button, text: "Asset", action: Action.JobAsset, value: String(j.seq) });
      } else if (j.status === "processing") {
        actions.push({ type: WidgetType.Button, variant: "primary", text: "Resume", action: Action.JobResume, value: String(j.seq) });
      }
      actions.push({ type: WidgetType.Button, text: "Details", action: Action.JobDetail, value: String(j.seq) });
      actions.push({ type: WidgetType.Button, text: "\u2715", action: Action.JobDelete, value: String(j.seq) });
      const row = [];
      const thumb = jobThumb(j.fileKey);
      if (thumb) row.push({ type: WidgetType.Image, src: thumb, width: 48 });
      row.push({
        type: WidgetType.VStack,
        gap: 1,
        children: [
          { type: WidgetType.Label, text: statusIcon(j.status) + " " + (j.label || j.kind) },
          { type: WidgetType.Label, muted: true, text: j.kind + (size ? " \xB7 " + size : "") }
        ]
      });
      kids.push({
        type: WidgetType.VStack,
        gap: 4,
        children: [
          { type: WidgetType.HStack, gap: 8, children: row },
          j.status === "failed" ? { type: WidgetType.Label, muted: true, text: "\u26A0 " + (j.error || "failed") } : { type: WidgetType.HStack, gap: 6, children: actions }
        ]
      });
      kids.push({ type: WidgetType.Separator });
    }
    return kids;
  }
  function jobDetailView(seq) {
    const j = findJob(seq);
    if (!j) return [{ type: WidgetType.Label, text: "Job not found." }, { type: WidgetType.Button, text: "\u2190 Back", action: Action.JobBack }];
    const req = j.request || {};
    const kids = [
      { type: WidgetType.HStack, gap: 8, children: [
        { type: WidgetType.Button, text: "\u2190 Back", action: Action.JobBack },
        { type: WidgetType.Label, text: statusIcon(j.status) + " " + (j.label || j.kind) }
      ] }
    ];
    const thumb = jobThumb(j.fileKey);
    if (thumb) kids.push({ type: WidgetType.Image, label: "Result", src: thumb, width: 96 });
    kids.push({ type: WidgetType.Separator });
    const row = (k, v) => ({ type: WidgetType.Label, muted: true, text: k + ": " + v });
    kids.push(row("Status", j.status));
    kids.push(row("Kind", j.kind));
    kids.push(row("Job ID", j.jobId));
    if (j.width) kids.push(row("Size", j.width + "\xD7" + j.height + (j.frameCount ? " \xB7 " + j.frameCount + " frames" : "")));
    if (j.seed != null) kids.push(row("Seed", String(j.seed)));
    if (j.generations != null) kids.push(row("Cost", j.generations + " generations" + (j.costIfPaid != null ? " (~$" + Number(j.costIfPaid).toFixed(4) + " if paid)" : "")));
    if (j.enhanceGens != null) kids.push(row("Prompt-enhance cost", j.enhanceGens + " generations"));
    if (j.createdAt) kids.push(row("Created", String(j.createdAt).replace("T", " ").slice(0, 19)));
    if (typeof req.action === "string") kids.push(row("Action", req.action));
    if (typeof req.description === "string") kids.push(row("Description", req.description));
    if (j.error) kids.push({ type: WidgetType.Label, text: "\u26A0 " + j.error });
    if (j.enhancedPrompt) {
      kids.push({ type: WidgetType.Separator });
      kids.push({ type: WidgetType.Label, text: "Enhanced prompt" });
      kids.push({ type: WidgetType.Text, text: j.enhancedPrompt });
    }
    if (j.status === "completed" && j.fileKey) {
      kids.push({ type: WidgetType.Separator });
      kids.push({ type: WidgetType.HStack, gap: 6, children: [
        { type: WidgetType.Button, variant: "primary", text: j.kind === "animate" ? "Open \u2192timeline" : "Insert", action: Action.JobInsert, value: String(j.seq) },
        j.kind !== "animate" ? { type: WidgetType.Button, text: "Asset", action: Action.JobAsset, value: String(j.seq) } : { type: WidgetType.Spacer }
      ] });
    } else if (j.status === "processing") {
      kids.push({ type: WidgetType.Button, variant: "primary", text: "Resume", action: Action.JobResume, value: String(j.seq) });
    }
    return kids;
  }
  async function resumeJob(seq) {
    const job = findJob(seq);
    if (!job || job.status !== "processing") return;
    try {
      const done = await poll(job.jobId, job.kind === "animate" ? "Animating" : "Fetching");
      const lr = done.last_response || done;
      const images = lr.images || [];
      if (!images.length) throw new Error("No result in job.");
      const gens = (lr.billing_usage || {}).generations;
      if (job.kind === "animate") {
        const frames = [];
        for (const img of images) frames.push(await px.image.decode(img.base64));
        const fw = frames[0].width, fh = frames[0].height, n = frames.length;
        const strip = new Uint32Array(fw * n * fh);
        for (let i = 0; i < n; i++) {
          const f = frames[i];
          for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) strip[y * (fw * n) + i * fw + x] = f.pixels[y * fw + x];
        }
        const key = "anim/resumed_" + nextSeq() + ".png";
        await px.files.put(key, {
          data: await px.image.encode(strip, fw * n, fh),
          mimeType: "image/png",
          name: job.label || "anim",
          meta: { response: { generations: gens, jobId: job.jobId, frames: n }, width: fw * n, height: fh, animation: true, frameW: fw, frameH: fh }
        });
        updateJob(seq, { status: "completed", fileKey: key, generations: gens });
      } else {
        const key = "gen/resumed_" + nextSeq() + ".png";
        await px.files.put(key, {
          data: images[0].base64,
          mimeType: "image/png",
          name: job.label || "sprite",
          meta: { response: { generations: gens, jobId: job.jobId } }
        });
        updateJob(seq, { status: "completed", fileKey: key, generations: gens });
      }
    } catch (e) {
      updateJob(seq, { status: "failed", error: (e?.message || String(e)).slice(0, 140) });
      throw e;
    }
  }
  async function openJob(seq, asAsset) {
    const job = findJob(seq);
    if (!job || !job.fileKey) throw new Error("No file for this job.");
    const f = await px.files.get(job.fileKey);
    const img = await px.image.decode(f.data);
    if (job.kind === "animate") {
      const fw = f.meta && f.meta.frameW || job.width || img.height;
      const fh = f.meta && f.meta.frameH || img.height;
      const n = Math.max(1, Math.round(img.width / fw));
      if (px.editor.width() === fw && px.editor.height() === fh) {
        while (px.editor.frameCount() < n) px.editor.addFrame();
        for (let i = 0; i < n; i++) {
          const fr = new Uint32Array(fw * fh);
          for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) fr[y * fw + x] = img.pixels[y * img.width + i * fw + x];
          px.editor.setFrame(i);
          px.editor.commit(fr);
        }
        px.editor.setFrame(0);
        await saveQuietly();
        return "Wrote " + n + " frames to the timeline (saved)";
      }
      const ref2 = await px.assets.create({ name: job.label || "anim", type: "character", width: img.width, height: img.height, pixels: img.pixels });
      px.assets.open(ref2.id);
      return "Opened strip as a new asset (canvas size differs)";
    }
    if (!asAsset && px.editor.width() === img.width && px.editor.height() === img.height) {
      px.editor.commit(img.pixels);
      await saveQuietly();
      return "Inserted into canvas (saved)";
    }
    const ref = await px.assets.create({ name: job.label || "sprite", type: "character", width: img.width, height: img.height, pixels: img.pixels });
    px.assets.open(ref.id);
    return "Opened as a new asset";
  }
  async function saveQuietly() {
    try {
      await px.editor.save();
    } catch {
    }
  }

  // src/features/settings.ts
  function settingsTab() {
    const s = getSettings();
    return [
      { type: WidgetType.Input, label: "API key", inputType: "password", value: s.apiKey, action: Action.ApiKey, placeholder: "paste your Pixellab token" },
      { type: WidgetType.Input, label: "Base URL", value: s.baseUrl, action: Action.BaseUrl },
      {
        type: WidgetType.HStack,
        gap: 6,
        children: [
          { type: WidgetType.Button, text: "Check balance", action: Action.Balance },
          { type: WidgetType.Label, muted: true, text: ui.balance != null ? "Balance: " + ui.balance : "" }
        ]
      },
      { type: WidgetType.Text, text: "Generations are billed by Pixellab. Larger sizes return multiple tiles; this plugin uses the first." }
    ];
  }

  // src/panel.ts
  function renderPanel() {
    const children = [{ type: WidgetType.Heading, text: "Pixellab AI" }];
    if (ui.error) children.push({ type: WidgetType.Label, text: "\u26A0 " + ui.error });
    children.push({
      type: WidgetType.Tabs,
      active: ui.tab,
      action: Action.Tab,
      tabs: [
        { label: "Generate", children: generateTab() },
        { label: "Animate", children: animateTab() },
        { label: "Repaint", children: repaintTab() },
        { label: "Jobs", children: ui.detailJob != null ? jobDetailView(ui.detailJob) : jobsTab() },
        { label: "Settings", children: settingsTab() }
      ]
    });
    return { type: WidgetType.VStack, gap: 10, children };
  }
  async function handleEvent(action, value) {
    ui.error = "";
    try {
      await route(action, value);
    } catch (e) {
      ui.error = e?.message || String(e);
      try {
        px.editor.clearMask();
      } catch {
      }
    }
  }
  async function route(action, value) {
    switch (action) {
      // --- navigation ---
      case Action.Tab:
        ui.tab = value;
        ui.detailJob = null;
        if (value === JOBS_TAB) await loadThumbs();
        return;
      case Action.JobDetail:
        ui.detailJob = Number(value);
        await loadThumbs();
        return;
      case Action.JobBack:
        ui.detailJob = null;
        return;
      case Action.GotoSettings:
        ui.tab = TABS.indexOf("settings");
        return;
      // --- settings persistence (input/select/checkbox → px.storage) ---
      case Action.Desc:
        px.storage.set("description", value);
        return;
      case Action.RepaintDesc:
        px.storage.set("repaintDesc", value);
        return;
      case Action.Size:
        px.storage.set("size", Number(value));
        return;
      case Action.NoBg:
        px.storage.set("noBg", value);
        return;
      case Action.ApiKey:
        px.storage.set("apiKey", value);
        return;
      case Action.BaseUrl:
        px.storage.set("baseUrl", value || BASE_DEFAULT);
        return;
      case Action.AnimAction:
        px.storage.set("action", value);
        return;
      case Action.FrameCount:
        px.storage.set("frameCount", Number(value));
        return;
      case Action.InputSource:
        px.storage.set("inputSource", value === "group" ? "group" : "cel");
        return;
      case Action.InputFrame:
        px.storage.set("inputFrame", Number(value));
        return;
      case Action.InputGroup:
        px.storage.set("inputGroup", value);
        return;
      case Action.LastFrame:
        px.storage.set("lastFrame", Number(value));
        return;
      case Action.Enhance:
        px.storage.set("enhance", value);
        return;
      case Action.Seed:
        px.storage.set("seed", value);
        return;
      // --- actions ---
      case Action.Generate: {
        const s = getSettings();
        ui.preview = await generateImage(s.description, s.size, s.size);
        return;
      }
      case Action.Insert:
        ui.error = await insertPreview(false);
        return;
      case Action.SaveAsset:
        ui.error = await insertPreview(true);
        return;
      case Action.Repaint:
        ui.error = await runRepaint();
        return;
      case Action.Animate: {
        const r = await animate();
        ui.error = "Animated \xB7 " + r.frames + " frames" + (r.generations != null ? " \xB7 " + r.generations + " generations" : "") + (r.sizeMatch ? " (written to timeline)" : " (size differed \u2014 saved to Jobs only)");
        return;
      }
      case Action.Balance:
        ui.balance = await checkBalance();
        return;
      case Action.JobInsert:
        ui.error = await openJob(Number(value), false);
        return;
      case Action.JobAsset:
        ui.error = await openJob(Number(value), true);
        return;
      case Action.JobResume:
        await resumeJob(Number(value));
        await loadThumbs();
        ui.error = "Job updated";
        return;
      case Action.JobDelete:
        removeJob(Number(value));
        return;
    }
  }

  // src/main.ts
  px.registerPanel("main", "Pixellab AI", renderPanel);
  px.onPanelEvent("main", handleEvent);
  px.registerCommand("pixellab.generate", "Generate sprite \u2192 canvas", async () => {
    const s = getSettings();
    ui.preview = await generateImage(s.description, s.size, s.size);
    await insertPreview(false);
  });
  px.registerMenu("Pixellab/Generate sprite \u2192 canvas", "pixellab.generate");
})();
