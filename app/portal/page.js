"use client";

import { useEffect, useMemo, useState } from "react";

function StatCard({ title, value, subtitle }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="text-sm text-white/45">{title}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</div>
      {subtitle ? <div className="mt-2 text-sm text-white/45">{subtitle}</div> : null}
    </div>
  );
}

function PanelCard({ title, children, right }) {
  return (
    <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function Badge({ children, color = "default" }) {
  const styles = {
    default: "bg-white/10 text-white/70 border border-white/10",
    green: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/20",
    yellow: "bg-amber-500/20 text-amber-300 border border-amber-500/20",
    red: "bg-red-500/20 text-red-300 border border-red-500/20",
    blue: "bg-blue-500/20 text-blue-300 border border-blue-500/20",
    purple: "bg-purple-500/20 text-purple-300 border border-purple-500/20",
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${styles[color]}`}>
      {children}
    </span>
  );
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatSeconds(sec) {
  const n = Number(sec || 0);
  if (!n) return "0 s";
  if (n < 60) return `${n} s`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

function getScoreColor(score) {
  const n = Number(score || 0);
  if (n >= 80) return "green";
  if (n >= 50) return "yellow";
  return "red";
}

function getInterestColor(interest) {
  const value = String(interest || "").toLowerCase();
  if (value === "alto") return "green";
  if (value === "medio") return "yellow";
  if (value === "bajo") return "red";
  return "default";
}

function getStatusLabel(status) {
  const map = {
    new: "Nuevo",
    contacted: "Contactado",
    qualified: "Cualificado",
    won: "Ganado",
    lost: "Perdido",
  };
  return map[status] || status || "Nuevo";
}

function MiniBarChart({ title, data, color = "bg-blue-400" }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="rounded-[24px] border border-white/10 bg-black/20 p-5">
      <div className="mb-4 text-sm text-white/50">{title}</div>
      <div className="flex h-48 items-end gap-3">
        {data.map((item) => {
          const height = Math.max((item.value / max) * 100, item.value > 0 ? 8 : 2);

          return (
            <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="text-xs text-white/45">{item.value}</div>
              <div className="flex h-36 w-full items-end">
                <div className={`w-full rounded-t-xl ${color}`} style={{ height: `${height}%` }} />
              </div>
              <div className="text-[10px] text-white/35">{item.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderTemplateText(templateText, lead, clientBrand) {
  if (!templateText) return "";
  return String(templateText)
    .replace(/\{\{nombre\}\}/gi, lead?.nombre || "")
    .replace(/\{\{telefono\}\}/gi, lead?.telefono || "")
    .replace(/\{\{necesidad\}\}/gi, lead?.necesidad || "")
    .replace(/\{\{empresa\}\}/gi, clientBrand || "");
}

function normalizePhoneForWhatsApp(phone) {
  if (!phone) return "";
  return String(phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function getDefaultOutreachMessage(lead, clientBrand) {
  return (
    lead?.next_step_ai ||
    `Hola ${lead?.nombre || ""}, te escribimos de ${clientBrand || "nuestro equipo"} para continuar con tu solicitud.`
  );
}

function LeadDrawer({
  lead,
  events,
  notes,
  comments,
  reminders,
  call,
  users,
  canEdit,
  sendingSms,
  smsTemplates,
  whatsappTemplates,
  clientBrand,
  onClose,
  onSave,
  onAddNote,
  onAddComment,
  onAddReminder,
  onGenerateNextStep,
  onSendFollowupSms,
}) {
  const [form, setForm] = useState({
    status: lead?.status || "new",
    owner: lead?.owner || "",
    notes: lead?.notes || "",
    proxima_accion: lead?.proxima_accion || "",
    ultima_accion: lead?.ultima_accion || "",
    valor_estimado: lead?.valor_estimado || "",
  });

  const [noteBody, setNoteBody] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderAt, setReminderAt] = useState("");

  const [selectedSmsTemplateId, setSelectedSmsTemplateId] = useState("");
  const [selectedWhatsappTemplateId, setSelectedWhatsappTemplateId] = useState("");
  const [outreachMessage, setOutreachMessage] = useState("");

  useEffect(() => {
    setForm({
      status: lead?.status || "new",
      owner: lead?.owner || "",
      notes: lead?.notes || "",
      proxima_accion: lead?.proxima_accion || "",
      ultima_accion: lead?.ultima_accion || "",
      valor_estimado: lead?.valor_estimado || "",
    });
    setNoteBody("");
    setCommentBody("");
    setReminderTitle("");
    setReminderAt("");

    const defaultSms = smsTemplates?.[0]?.id || "";
    const defaultWa = whatsappTemplates?.[0]?.id || "";
    setSelectedSmsTemplateId(defaultSms);
    setSelectedWhatsappTemplateId(defaultWa);

    if (lead) {
      setOutreachMessage(getDefaultOutreachMessage(lead, clientBrand));
    } else {
      setOutreachMessage("");
    }
  }, [lead, smsTemplates, whatsappTemplates, clientBrand]);

  if (!lead) return null;

  const selectedSmsTemplate =
    (smsTemplates || []).find((t) => t.id === selectedSmsTemplateId) || null;

  const selectedWhatsappTemplate =
    (whatsappTemplates || []).find((t) => t.id === selectedWhatsappTemplateId) || null;

  function applySmsTemplate() {
    const text = renderTemplateText(selectedSmsTemplate?.text, lead, clientBrand);
    setOutreachMessage(text || outreachMessage);
  }

  function applyWhatsappTemplate() {
    const text = renderTemplateText(selectedWhatsappTemplate?.text, lead, clientBrand);
    setOutreachMessage(text || outreachMessage);
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(outreachMessage || "");
      alert("Mensaje copiado.");
    } catch (err) {
      console.error(err);
      alert("No se pudo copiar el mensaje.");
    }
  }

  function openWhatsApp() {
    const phone = normalizePhoneForWhatsApp(lead.telefono);
    if (!phone) {
      alert("Este lead no tiene teléfono válido.");
      return;
    }
    const text = encodeURIComponent(outreachMessage || "");
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="h-full w-full max-w-5xl overflow-y-auto border-l border-white/10 bg-[#060606] p-6 shadow-2xl shadow-black">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm uppercase tracking-[0.2em] text-blue-300">Ficha del lead</div>
            <h2 className="mt-2 text-3xl font-semibold text-white">{lead.nombre || "Lead sin nombre"}</h2>
            <div className="mt-2 text-sm text-white/45">Registrado el {formatDate(lead.created_at)}</div>
          </div>

          <button
            onClick={onClose}
            className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
          >
            Cerrar
          </button>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <Badge color={getScoreColor(lead.score)}>Puntuación {lead.score || 0}</Badge>
          <Badge color="blue">{getStatusLabel(lead.status)}</Badge>
          <Badge color={getInterestColor(lead.interes)}>{lead.interes || "medio"}</Badge>
          <Badge color="green">Predicción {lead.predicted_close_probability || 0}%</Badge>
          {lead.followup_sms_sent ? <Badge color="yellow">SMS enviado</Badge> : null}
          {(lead.tags || []).map((tag, i) => (
            <Badge key={i}>{tag}</Badge>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/45">Nombre</div>
            <div className="mt-2 text-lg font-semibold text-white">{lead.nombre || "-"}</div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/45">Teléfono</div>
            <div className="mt-2 text-lg font-semibold text-white">{lead.telefono || "-"}</div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/45">Ciudad</div>
            <div className="mt-2 text-lg font-semibold text-white">{lead.ciudad || "-"}</div>
          </div>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/45">Fuente</div>
            <div className="mt-2 text-lg font-semibold text-white">{lead.fuente || lead.origen || "-"}</div>
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
          <div className="text-sm text-white/45">Necesidad</div>
          <div className="mt-2 text-white/80">{lead.necesidad || "-"}</div>
        </div>

        <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
          <div className="text-sm text-white/45">Siguiente paso con IA</div>
          <div className="mt-2 text-white/80">{lead.next_step_ai || "-"}</div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <label className="text-sm text-white/45">Estado</label>
            <select
              disabled={!canEdit}
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white disabled:opacity-50"
            >
              {[
                { value: "new", label: "Nuevo" },
                { value: "contacted", label: "Contactado" },
                { value: "qualified", label: "Cualificado" },
                { value: "won", label: "Ganado" },
                { value: "lost", label: "Perdido" },
              ].map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <label className="text-sm text-white/45">Responsable</label>
            <select
              disabled={!canEdit}
              value={form.owner}
              onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white disabled:opacity-50"
            >
              <option value="">Sin asignar</option>
              {users.map((u) => (
                <option key={u.id} value={u.full_name}>
                  {u.full_name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <label className="text-sm text-white/45">Valor estimado (€)</label>
            <input
              disabled={!canEdit}
              value={form.valor_estimado}
              onChange={(e) => setForm((f) => ({ ...f, valor_estimado: e.target.value }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white disabled:opacity-50"
            />
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <label className="text-sm text-white/45">Última acción</label>
            <input
              disabled={!canEdit}
              value={form.ultima_accion}
              onChange={(e) => setForm((f) => ({ ...f, ultima_accion: e.target.value }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white disabled:opacity-50"
            />
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 md:col-span-2">
            <label className="text-sm text-white/45">Próxima acción</label>
            <input
              disabled={!canEdit}
              value={form.proxima_accion}
              onChange={(e) => setForm((f) => ({ ...f, proxima_accion: e.target.value }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white disabled:opacity-50"
            />
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 md:col-span-2">
            <label className="text-sm text-white/45">Notas del lead</label>
            <textarea
              disabled={!canEdit}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={4}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white disabled:opacity-50"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={lead.telefono ? `tel:${lead.telefono}` : "#"}
            className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
          >
            Llamar
          </a>

          <button
            onClick={() => navigator.clipboard.writeText(lead.telefono || "")}
            className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5"
          >
            Copiar teléfono
          </button>

          {canEdit ? (
            <>
              <button
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    status: "contacted",
                    ultima_accion: "Marcado como contactado desde el portal",
                  }))
                }
                className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5"
              >
                Marcar como contactado
              </button>

              <button
                onClick={() => onGenerateNextStep(lead)}
                className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5"
              >
                Generar siguiente paso con IA
              </button>

              <button
                onClick={() => onSave(lead.id, form)}
                className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black hover:bg-emerald-400"
              >
                Guardar cambios
              </button>
            </>
          ) : null}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <div className="space-y-6">
            <PanelCard title="Historial">
              <div className="space-y-3">
                {events.length === 0 ? (
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-white/45">
                    No hay eventos todavía.
                  </div>
                ) : (
                  events.map((e) => (
                    <div key={e.id} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                      <div className="text-xs text-white/45">{formatDate(e.created_at)}</div>
                      <div className="mt-2 text-lg font-semibold text-white">{e.title}</div>
                      <div className="mt-2 text-sm leading-7 text-white/70">{e.description || "-"}</div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>

            <PanelCard title="Notas internas">
              {canEdit ? (
                <div className="mb-4 space-y-3">
                  <textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    rows={3}
                    placeholder="Añadir nota interna..."
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                  />
                  <button
                    onClick={() => {
                      if (!noteBody.trim()) return;
                      onAddNote(lead.id, noteBody);
                      setNoteBody("");
                    }}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black"
                  >
                    Añadir nota
                  </button>
                </div>
              ) : null}

              <div className="space-y-3">
                {notes.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/45">
                    Sin notas.
                  </div>
                ) : (
                  notes.map((n) => (
                    <div key={n.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-white">{n.author || "Usuario"}</div>
                        <div className="text-xs text-white/45">{formatDate(n.created_at)}</div>
                      </div>
                      <div className="mt-2 text-sm text-white/70">{n.body}</div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>

            <PanelCard title="Comentarios internos">
              {canEdit ? (
                <div className="mb-4 space-y-3">
                  <textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    rows={3}
                    placeholder="Añadir comentario..."
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                  />
                  <button
                    onClick={() => {
                      if (!commentBody.trim()) return;
                      onAddComment(lead.id, commentBody);
                      setCommentBody("");
                    }}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black"
                  >
                    Añadir comentario
                  </button>
                </div>
              ) : null}

              <div className="space-y-3">
                {comments.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/45">
                    Sin comentarios.
                  </div>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-white">{c.author || "Usuario"}</div>
                        <div className="text-xs text-white/45">{formatDate(c.created_at)}</div>
                      </div>
                      <div className="mt-2 text-sm text-white/70">{c.body}</div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>
          </div>

          <div className="space-y-6">
            <PanelCard title="Seguimiento comercial">
              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="mb-3 text-sm text-white/45">Plantilla de SMS</div>
                  <div className="flex flex-col gap-3">
                    <select
                      value={selectedSmsTemplateId}
                      onChange={(e) => setSelectedSmsTemplateId(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                    >
                      <option value="">Selecciona plantilla SMS</option>
                      {(smsTemplates || []).map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={applySmsTemplate}
                      className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/5"
                    >
                      Aplicar plantilla SMS
                    </button>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="mb-3 text-sm text-white/45">Plantilla de WhatsApp</div>
                  <div className="flex flex-col gap-3">
                    <select
                      value={selectedWhatsappTemplateId}
                      onChange={(e) => setSelectedWhatsappTemplateId(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                    >
                      <option value="">Selecciona plantilla de WhatsApp</option>
                      {(whatsappTemplates || []).map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={applyWhatsappTemplate}
                      className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/5"
                    >
                      Aplicar plantilla de WhatsApp
                    </button>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-sm text-white/45">Mensaje</div>
                  <textarea
                    value={outreachMessage}
                    onChange={(e) => setOutreachMessage(e.target.value)}
                    rows={6}
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                    placeholder="Escribe o genera aquí tu mensaje de seguimiento"
                  />

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => setOutreachMessage(getDefaultOutreachMessage(lead, clientBrand))}
                      className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/5"
                    >
                      Restablecer mensaje
                    </button>

                    <button
                      onClick={copyMessage}
                      className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/5"
                    >
                      Copiar mensaje
                    </button>

                    {canEdit ? (
                      <button
                        onClick={() =>
                          onSendFollowupSms(lead, outreachMessage, selectedSmsTemplateId)
                        }
                        disabled={sendingSms}
                        className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-60"
                      >
                        {sendingSms ? "Enviando..." : "Enviar SMS"}
                      </button>
                    ) : null}

                    <button
                      onClick={openWhatsApp}
                      className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-white/90"
                    >
                      Abrir WhatsApp
                    </button>
                  </div>
                </div>
              </div>
            </PanelCard>

            <PanelCard title="Recordatorios">
              {canEdit ? (
                <div className="mb-4 grid gap-3">
                  <input
                    value={reminderTitle}
                    onChange={(e) => setReminderTitle(e.target.value)}
                    placeholder="Título del recordatorio"
                    className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                  />
                  <input
                    type="datetime-local"
                    value={reminderAt}
                    onChange={(e) => setReminderAt(e.target.value)}
                    className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                  />
                  <button
                    onClick={() => {
                      if (!reminderTitle.trim() || !reminderAt) return;
                      onAddReminder(lead.id, reminderTitle, reminderAt, form.owner);
                      setReminderTitle("");
                      setReminderAt("");
                    }}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black"
                  >
                    Añadir recordatorio
                  </button>
                </div>
              ) : null}

              <div className="space-y-3">
                {reminders.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/45">
                    Sin recordatorios.
                  </div>
                ) : (
                  reminders.map((r) => (
                    <div key={r.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="font-medium text-white">{r.title}</div>
                      <div className="mt-1 text-sm text-white/55">{formatDate(r.remind_at)}</div>
                      <div className="mt-2 text-sm text-white/70">Asignado a: {r.assigned_to || "-"}</div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>

            <PanelCard title="Llamada asociada">
              {call ? (
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <div className="text-sm text-white/45">Fecha</div>
                        <div className="mt-2 text-white/80">{formatDate(call.created_at)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-white/45">Duración</div>
                        <div className="mt-2 text-white/80">{formatSeconds(call.duration_seconds)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-white/45">Estado</div>
                        <div className="mt-2">
                          <Badge color="blue">{call.status || "-"}</Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                    <div className="text-sm text-white/45">Resumen</div>
                    <div className="mt-2 text-white/80">{call.summary || "-"}</div>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                    <div className="text-sm text-white/45">Resumen largo</div>
                    <div className="mt-2 text-white/70">{call.summary_long || "-"}</div>
                  </div>

                  {call.recording_url ? (
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                      <div className="text-sm text-white/45">Grabación</div>
                      <audio controls className="mt-3 w-full">
                        <source src={call.recording_url} />
                      </audio>
                    </div>
                  ) : (
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-white/45">
                      No hay grabación guardada todavía.
                    </div>
                  )}

                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                    <div className="text-sm text-white/45">Transcripción</div>
                    <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-white/70">
                      {call.transcript || "Sin transcripción"}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-white/45">
                  No se ha podido asociar una llamada exacta.
                </div>
              )}
            </PanelCard>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClientPortalPage() {
  const [data, setData] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadEvents, setLeadEvents] = useState([]);
  const [leadNotes, setLeadNotes] = useState([]);
  const [leadComments, setLeadComments] = useState([]);
  const [leadReminders, setLeadReminders] = useState([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);
  const [brandingForm, setBrandingForm] = useState(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [newUser, setNewUser] = useState({
    full_name: "",
    email: "",
    role: "agent",
    phone: "",
  });

  const [filters, setFilters] = useState({
    search: "",
    status: "all",
    owner: "all",
    interes: "all",
    ciudad: "all",
    minScore: "0",
    from: "",
    to: "",
  });

  useEffect(() => {
    loadOverview();
    const interval = setInterval(loadOverview, 15000);
    return () => clearInterval(interval);
  }, []);

  async function loadOverview() {
    const res = await fetch("/api/portal/overview", { cache: "no-store" });
    const json = await res.json();
    setData(json);
    if (json?.client) {
      setBrandingForm({
        brand_name: json.client.brand_name || json.client.name || "",
        brand_logo_url: json.client.brand_logo_url || "",
        primary_color: json.client.primary_color || "#ffffff",
        secondary_color: json.client.secondary_color || "#030303",
        owner_email: json.client.owner_email || "",
        industry: json.client.industry || "",
      });
    }
  }

  async function openLead(lead) {
    setSelectedLead(lead);

    const [eventsRes, notesRes, commentsRes, remindersRes] = await Promise.all([
      fetch(`/api/lead-events?lead_id=${lead.id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/lead-notes?lead_id=${lead.id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/lead-comments?lead_id=${lead.id}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/lead-reminders?lead_id=${lead.id}`, { cache: "no-store" }).then((r) => r.json()),
    ]);

    setLeadEvents(eventsRes.data || []);
    setLeadNotes(notesRes.data || []);
    setLeadComments(commentsRes.data || []);
    setLeadReminders(remindersRes.data || []);
  }

  async function saveLeadChanges(leadId, changes) {
    const res = await fetch("/api/leads/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, ...changes }),
    });

    const json = await res.json();
    if (!json.success) {
      alert(json.message || "No se pudo actualizar el lead.");
      return;
    }

    await loadOverview();
    const updatedLead = json.data;
    setSelectedLead(updatedLead);
    await openLead(updatedLead);
  }

  async function addNote(leadId, body) {
    const res = await fetch("/api/lead-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, body }),
    });
    const json = await res.json();
    if (!json.success) {
      alert(json.message || "No se pudo crear la nota.");
      return;
    }
    if (selectedLead) await openLead(selectedLead);
  }

  async function addComment(leadId, body) {
    const res = await fetch("/api/lead-comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, body }),
    });
    const json = await res.json();
    if (!json.success) {
      alert(json.message || "No se pudo crear el comentario.");
      return;
    }
    if (selectedLead) await openLead(selectedLead);
  }

  async function addReminder(leadId, title, remind_at, assigned_to) {
    const res = await fetch("/api/lead-reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, title, remind_at, assigned_to }),
    });
    const json = await res.json();
    if (!json.success) {
      alert(json.message || "No se pudo crear el recordatorio.");
      return;
    }
    if (selectedLead) await openLead(selectedLead);
  }

  async function generateNextStep(lead) {
    try {
      const res = await fetch("/api/ai/next-step", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadId: lead.id,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        alert(json.message || "No se pudo generar el siguiente paso.");
        return;
      }

      alert("Siguiente paso generado.");
      await loadOverview();
      await openLead(json.data);
    } catch (err) {
      console.error(err);
      alert("Error generando siguiente paso.");
    }
  }

  async function sendFollowupSms(lead, messageOverride = "", templateId = null) {
    try {
      setSendingSms(true);

      const message =
        messageOverride ||
        lead.next_step_ai ||
        `Hola ${lead.nombre || ""}, te escribimos para continuar con tu solicitud. Cuando quieras te ayudamos con el siguiente paso.`;

      const res = await fetch("/api/followup/sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadId: lead.id,
          to: lead.telefono,
          message,
          templateId,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        alert(json.message || "No se pudo enviar el SMS.");
        return;
      }

      alert("SMS enviado correctamente.");
      await loadOverview();
      await openLead(json.data || lead);
    } catch (err) {
      console.error(err);
      alert("Error enviando SMS.");
    } finally {
      setSendingSms(false);
    }
  }

  function openLeadWhatsApp(lead) {
    const phone = normalizePhoneForWhatsApp(lead.telefono);
    if (!phone) {
      alert("Este lead no tiene teléfono válido.");
      return;
    }

    const baseTemplate =
      (data?.whatsappTemplates || [])[0]?.text ||
      `Hola {{nombre}}, te escribimos de {{empresa}} para continuar con tu solicitud.`;

    const text = renderTemplateText(
      baseTemplate,
      lead,
      data?.client?.brand_name || data?.client?.name || "nuestro equipo"
    );

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function quickSmsFromTable(lead) {
    const template =
      (data?.smsTemplates || [])[0]?.text ||
      `Hola {{nombre}}, te escribimos de {{empresa}} para continuar con tu solicitud.`;

    const message = renderTemplateText(
      template,
      lead,
      data?.client?.brand_name || data?.client?.name || "nuestro equipo"
    );

    await sendFollowupSms(lead, message, (data?.smsTemplates || [])[0]?.id || null);
  }

  function toggleLeadSelection(leadId) {
    setSelectedLeadIds((prev) =>
      prev.includes(leadId)
        ? prev.filter((id) => id !== leadId)
        : [...prev, leadId]
    );
  }

  function clearLeadSelection() {
    setSelectedLeadIds([]);
  }

  async function bulkMarkContacted() {
    if (!selectedLeadIds.length) {
      alert("No has seleccionado ningún lead.");
      return;
    }

    try {
      await Promise.all(
        selectedLeadIds.map((leadId) =>
          saveLeadChanges(leadId, {
            status: "contacted",
            ultima_accion: "Marcado como contactado en acción masiva",
          })
        )
      );

      clearLeadSelection();
      alert("Leads marcados como contactados.");
    } catch (err) {
      console.error(err);
      alert("No se pudieron actualizar todos los leads.");
    }
  }

  function bulkOpenWhatsapp() {
    if (!selectedLeadIds.length) {
      alert("No has seleccionado ningún lead.");
      return;
    }

    const leads = (data?.leads || []).filter((l) => selectedLeadIds.includes(l.id));

    leads.forEach((lead) => {
      const phone = normalizePhoneForWhatsApp(lead.telefono);
      if (!phone) return;

      const template =
        (data?.whatsappTemplates || [])[0]?.text ||
        `Hola {{nombre}}, te escribimos de {{empresa}} para continuar con tu solicitud.`;

      const text = renderTemplateText(
        template,
        lead,
        data?.client?.brand_name || data?.client?.name || "nuestro equipo"
      );

      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
    });
  }

  async function bulkSendSms() {
    if (!selectedLeadIds.length) {
      alert("No has seleccionado ningún lead.");
      return;
    }

    try {
      setSendingSms(true);

      const leads = (data?.leads || []).filter((l) => selectedLeadIds.includes(l.id));

      for (const lead of leads) {
        const template =
          (data?.smsTemplates || [])[0]?.text ||
          `Hola {{nombre}}, te escribimos de {{empresa}} para continuar con tu solicitud.`;

        const message = renderTemplateText(
          template,
          lead,
          data?.client?.brand_name || data?.client?.name || "nuestro equipo"
        );

        const res = await fetch("/api/followup/sms", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            leadId: lead.id,
            to: lead.telefono,
            message,
          }),
        });

        const json = await res.json();
        if (!json.success) {
          console.error("Error en lead", lead.id, json.message);
        }
      }

      clearLeadSelection();
      await loadOverview();
      alert("SMS enviados a todos los seleccionados.");
    } catch (err) {
      console.error(err);
      alert("Error en el envío masivo.");
    } finally {
      setSendingSms(false);
    }
  }

  async function saveBranding() {
    const res = await fetch("/api/portal/branding/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(brandingForm),
    });
    const json = await res.json();
    if (!json.success) {
      alert(json.message || "No se pudo guardar el branding.");
      return;
    }
    await loadOverview();
    alert("Branding actualizado.");
  }

  async function createUser() {
    const res = await fetch("/api/portal/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    const json = await res.json();
    if (!json.success) {
      alert(json.message || "No se pudo crear el usuario.");
      return;
    }
    setNewUser({ full_name: "", email: "", role: "agent", phone: "" });
    await loadOverview();
  }

  async function openBillingPortal() {
    try {
      setBillingLoading(true);
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: data?.client?.id || "demo" }),
      });
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      alert(json?.message || "El portal de Stripe no está disponible.");
    } catch (err) {
      alert(err?.message || "No se pudo abrir la facturación.");
    } finally {
      setBillingLoading(false);
    }
  }

  async function openCheckout(plan = "pro") {
    try {
      setBillingLoading(true);
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: data?.client?.id || "demo",
          plan,
        }),
      });

      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      alert(json?.message || "El checkout no está disponible.");
    } catch (err) {
      alert(err?.message || "No se pudo abrir el checkout.");
    } finally {
      setBillingLoading(false);
    }
  }

  function exportCsv() {
    window.location.href = "/api/leads/export";
  }

  async function sendWeeklyReport() {
    const res = await fetch("/api/weekly-report/send", { method: "POST" });
    const json = await res.json();
    alert(json.success ? "Resumen semanal enviado." : json.message || "No se pudo enviar.");
  }

  async function sendDailyReport() {
    const res = await fetch("/api/daily-report/send", { method: "POST" });
    const json = await res.json();
    alert(json.success ? "Resumen diario enviado." : json.message || "No se pudo enviar.");
  }

  async function runNightly() {
    const res = await fetch("/api/nightly", { method: "POST" });
    const json = await res.json();
    alert(json.success ? "Proceso nocturno ejecutado." : json.message || "No se pudo ejecutar.");
    await loadOverview();
  }

  const availableCities = useMemo(() => {
    return [...new Set((data?.leads || []).map((lead) => lead.ciudad).filter(Boolean))];
  }, [data]);

  const filteredLeads = useMemo(() => {
    const leads = data?.leads || [];

    return leads.filter((lead) => {
      const score = Number(lead.score || 0);
      const statusOk = filters.status === "all" ? true : lead.status === filters.status;
      const ownerOk =
        filters.owner === "all"
          ? true
          : filters.owner === "unassigned"
          ? !lead.owner
          : lead.owner === filters.owner;
      const interestOk =
        filters.interes === "all" ? true : String(lead.interes || "").toLowerCase() === filters.interes;
      const cityOk = filters.ciudad === "all" ? true : lead.ciudad === filters.ciudad;
      const scoreOk = score >= Number(filters.minScore || 0);

      const q = filters.search.toLowerCase();
      const searchOk =
        !q ||
        String(lead.nombre || "").toLowerCase().includes(q) ||
        String(lead.telefono || "").toLowerCase().includes(q) ||
        String(lead.necesidad || "").toLowerCase().includes(q);

      const created = lead.created_at ? new Date(lead.created_at).getTime() : 0;
      const fromOk = filters.from ? created >= new Date(filters.from).getTime() : true;
      const toOk = filters.to ? created <= new Date(filters.to + "T23:59:59").getTime() : true;

      return statusOk && ownerOk && interestOk && cityOk && scoreOk && searchOk && fromOk && toOk;
    });
  }, [data, filters]);

  if (!data) {
    return <div className="min-h-screen bg-[#030303] p-8 text-white">Cargando portal...</div>;
  }

  const client = data.client || {};
  const settings = data.settings || {};
  const users = data.users || [];
  const calls = data.calls || [];
  const alerts = data.alerts || [];
  const insights = data.insights || [];
  const auditLogs = data.auditLogs || [];
  const metrics = data.metrics || {};
  const pipeline = data.pipeline || {};
  const rankings = data.rankings || { bestDays: [], bestHours: [] };
  const smsTemplates = data.smsTemplates || [];
  const whatsappTemplates = data.whatsappTemplates || [];
  const currentRole = data.currentRole || "viewer";

  const canEdit = ["owner", "admin", "manager", "agent"].includes(currentRole);
  const canAdmin = ["owner", "admin"].includes(currentRole);

  const chartCalls = rankings.bestDays.length
    ? rankings.bestDays.map((d) => ({ label: d.label, value: d.calls }))
    : [{ label: "Sin datos", value: 0 }];

  const chartLeads = rankings.bestDays.length
    ? rankings.bestDays.map((d) => ({ label: d.label, value: d.leads }))
    : [{ label: "Sin datos", value: 0 }];

  const leadsByOwner = users.map((user) => {
    const ownedLeads = (data?.leads || []).filter((lead) => lead.owner === user.full_name);
    const won = ownedLeads.filter((lead) => lead.status === "won").length;
    const qualified = ownedLeads.filter((lead) => lead.status === "qualified").length;
    const revenue = ownedLeads.reduce(
      (acc, lead) => acc + Number(lead.valor_estimado || settings.default_deal_value || 0),
      0
    );

    return {
      id: user.id,
      full_name: user.full_name,
      role: user.role,
      leads: ownedLeads.length,
      won,
      qualified,
      revenue,
    };
  });

  const totalSelectedValue = (data?.leads || [])
    .filter((lead) => selectedLeadIds.includes(lead.id))
    .reduce((acc, lead) => acc + Number(lead.valor_estimado || settings.default_deal_value || 0), 0);

  function onDragStart(ev, leadId) {
    ev.dataTransfer.setData("leadId", leadId);
  }

  async function onDropStatus(ev, status) {
    ev.preventDefault();
    if (!canEdit) return;
    const leadId = ev.dataTransfer.getData("leadId");
    if (!leadId) return;
    await saveLeadChanges(leadId, {
      status,
      ultima_accion: `Estado cambiado a ${getStatusLabel(status)} con arrastrar y soltar`,
    });
  }

  function onDragOver(ev) {
    ev.preventDefault();
  }

  return (
    <div
      className="min-h-screen overflow-x-hidden text-white"
      style={{ background: client.secondary_color || "#030303" }}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_24%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.05),transparent_35%)]" />

      <main className="relative mx-auto max-w-7xl px-6 pb-20 pt-14 md:pb-28">
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="flex items-start gap-4">
            {client.brand_logo_url ? (
              <img
                src={client.brand_logo_url}
                alt="logo"
                className="h-14 w-14 rounded-2xl object-cover"
              />
            ) : (
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold"
                style={{ background: client.primary_color || "#fff", color: "#000" }}
              >
                {(client.brand_name || client.name || "N").slice(0, 1)}
              </div>
            )}

            <div>
              <div className="text-sm uppercase tracking-[0.2em]" style={{ color: client.primary_color || "#93c5fd" }}>
                {client.brand_name || client.name || "Portal empresarial"}
              </div>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-6xl">
                Control operativo y comercial en tiempo real
              </h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-white/60">
                Pipeline, insights, equipo, alertas, branding, notas, recordatorios y más.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => openCheckout("pro")}
              disabled={billingLoading}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60"
            >
              {billingLoading ? "Abriendo..." : "Contratar o ampliar plan"}
            </button>

            <button
              onClick={openBillingPortal}
              disabled={billingLoading}
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/5 disabled:opacity-60"
            >
              Gestionar facturación
            </button>

            <button
              onClick={exportCsv}
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/5"
            >
              Exportar CSV
            </button>

            <button
              onClick={sendDailyReport}
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/5"
            >
              Enviar diario
            </button>

            <button
              onClick={sendWeeklyReport}
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/5"
            >
              Enviar semanal
            </button>

            <button
              onClick={runNightly}
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/5"
            >
              Ejecutar proceso nocturno
            </button>
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/45">Plan actual</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {client.plan || "pro"}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/45">Límite de llamadas</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {client.calls_limit || client.callsLimit || 0}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/45">Estado del cliente</div>
            <div className="mt-2">
              <Badge color={client.is_active === false ? "red" : "green"}>
                {client.is_active === false ? "Inactivo" : "Activo"}
              </Badge>
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-[30px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                if (!filteredLeads.length) return;
                openLead(filteredLeads[0]);
              }}
              className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-white/90"
            >
              Abrir primer lead
            </button>

            <button
              onClick={() => {
                const hotLead = filteredLeads.find((l) => Number(l.score || 0) >= 80);
                if (!hotLead) {
                  alert("No hay leads calientes con los filtros actuales.");
                  return;
                }
                openLead(hotLead);
              }}
              className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/5"
            >
              Ir al lead más caliente
            </button>

            <button
              onClick={() => {
                const unassigned = filteredLeads.find((l) => !l.owner);
                if (!unassigned) {
                  alert("No hay leads sin responsable con los filtros actuales.");
                  return;
                }
                openLead(unassigned);
              }}
              className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/5"
            >
              Revisar lead sin responsable
            </button>
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard title="Llamadas" value={metrics.totalCalls || 0} subtitle="Histórico total" />
          <StatCard title="Leads" value={metrics.totalLeads || 0} subtitle="Capturados" />
          <StatCard title="Conversión" value={`${metrics.conversionRate || 0}%`} subtitle="Leads por llamadas" />
          <StatCard title="Duración media" value={formatSeconds(metrics.avgDuration || 0)} subtitle="Tiempo por llamada" />
          <StatCard title="Puntuación media" value={metrics.avgLeadScore || 0} subtitle="Calidad media" />
          <StatCard title="Ingresos potenciales" value={`${Number(metrics.totalPotentialRevenue || 0).toFixed(0)}€`} subtitle="Estimación" />
        </div>

        <div className="mb-8 grid gap-6 xl:grid-cols-2">
          <MiniBarChart title="Llamadas por día" data={chartCalls} color="bg-blue-400" />
          <MiniBarChart title="Leads por día" data={chartLeads} color="bg-emerald-400" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-6">
            <PanelCard title="Pipeline visual tipo CRM" right={<Badge color="green">{filteredLeads.length} leads</Badge>}>
              <div className="grid gap-4 md:grid-cols-5">
                {["new", "contacted", "qualified", "won", "lost"].map((st) => (
                  <div
                    key={st}
                    onDrop={(e) => onDropStatus(e, st)}
                    onDragOver={onDragOver}
                    className="rounded-[24px] border border-white/10 bg-black/20 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="font-semibold text-white">{getStatusLabel(st)}</div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge color="blue">{pipeline[st] || 0}</Badge>
                        <div className="text-[10px] text-white/35">
                          {filteredLeads
                            .filter((lead) => (lead.status || "new") === st)
                            .reduce(
                              (acc, lead) =>
                                acc + Number(lead.valor_estimado || settings.default_deal_value || 0),
                              0
                            )
                            .toFixed(0)}
                          €
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {filteredLeads
                        .filter((lead) => (lead.status || "new") === st)
                        .slice(0, 6)
                        .map((lead) => (
                          <button
                            key={lead.id}
                            draggable={canEdit}
                            onDragStart={(e) => onDragStart(e, lead.id)}
                            onClick={() => openLead(lead)}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left hover:bg-white/[0.07]"
                          >
                            <div className="font-medium text-white">{lead.nombre || "Sin nombre"}</div>
                            <div className="mt-1 text-xs text-white/50">{lead.necesidad || "-"}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Badge color={getScoreColor(lead.score)}>Puntuación {lead.score || 0}</Badge>
                              <Badge color="green">{lead.predicted_close_probability || 0}%</Badge>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </PanelCard>

            <PanelCard title="Leads capturados">
              <div className="mb-4 grid gap-3 md:grid-cols-8">
                <input
                  placeholder="Buscar nombre, teléfono o necesidad"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white md:col-span-2"
                />

                <select
                  value={filters.status}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                  className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                >
                  <option value="all">Todos los estados</option>
                  <option value="new">Nuevo</option>
                  <option value="contacted">Contactado</option>
                  <option value="qualified">Cualificado</option>
                  <option value="won">Ganado</option>
                  <option value="lost">Perdido</option>
                </select>

                <select
                  value={filters.owner}
                  onChange={(e) => setFilters((f) => ({ ...f, owner: e.target.value }))}
                  className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                >
                  <option value="all">Todos los responsables</option>
                  <option value="unassigned">Sin responsable</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.full_name}>
                      {u.full_name}
                    </option>
                  ))}
                </select>

                <select
                  value={filters.interes}
                  onChange={(e) => setFilters((f) => ({ ...f, interes: e.target.value }))}
                  className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                >
                  <option value="all">Todos los intereses</option>
                  <option value="alto">Alto</option>
                  <option value="medio">Medio</option>
                  <option value="bajo">Bajo</option>
                </select>

                <select
                  value={filters.ciudad}
                  onChange={(e) => setFilters((f) => ({ ...f, ciudad: e.target.value }))}
                  className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                >
                  <option value="all">Todas las ciudades</option>
                  {availableCities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>

                <select
                  value={filters.minScore}
                  onChange={(e) => setFilters((f) => ({ ...f, minScore: e.target.value }))}
                  className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                >
                  <option value="0">Puntuación desde 0</option>
                  <option value="50">Puntuación desde 50</option>
                  <option value="80">Puntuación desde 80</option>
                </select>

                <div className="grid grid-cols-2 gap-3 md:col-span-2">
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                    className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                  />
                  <input
                    type="date"
                    value={filters.to}
                    onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                    className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                  />
                </div>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-sm text-white/60">
                  Seleccionados: <span className="font-semibold text-white">{selectedLeadIds.length}</span>
                </div>

                <div className="text-sm text-white/60">
                  Valor total seleccionado:{" "}
                  <span className="font-semibold text-white">{totalSelectedValue}€</span>
                </div>

                <button
                  onClick={bulkMarkContacted}
                  className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
                >
                  Marcar como contactados
                </button>

                <button
                  onClick={bulkSendSms}
                  disabled={sendingSms}
                  className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5 disabled:opacity-60"
                >
                  {sendingSms ? "Enviando SMS masivo..." : "Enviar SMS a seleccionados"}
                </button>

                <button
                  onClick={bulkOpenWhatsapp}
                  className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
                >
                  Abrir WhatsApp seleccionados
                </button>

                <button
                  onClick={clearLeadSelection}
                  className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
                >
                  Limpiar selección
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-white/45">
                      <th className="pb-3 pr-4">Sel.</th>
                      <th className="pb-3 pr-4">Fecha</th>
                      <th className="pb-3 pr-4">Nombre</th>
                      <th className="pb-3 pr-4">Teléfono</th>
                      <th className="pb-3 pr-4">Responsable</th>
                      <th className="pb-3 pr-4">Puntuación</th>
                      <th className="pb-3 pr-4">Estado</th>
                      <th className="pb-3 pr-4">Interés</th>
                      <th className="pb-3 pr-4">Valor €</th>
                      <th className="pb-3 pr-4">Predicción</th>
                      <th className="pb-3 pr-4">Indicadores</th>
                      <th className="pb-3 pr-4">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="py-6 text-white/40">
                          No hay leads con esos filtros.
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.slice(0, 50).map((lead) => (
                        <tr key={lead.id} className="border-b border-white/5 align-top">
                          <td className="py-4 pr-4">
                            <input
                              type="checkbox"
                              checked={selectedLeadIds.includes(lead.id)}
                              onChange={() => toggleLeadSelection(lead.id)}
                            />
                          </td>
                          <td className="py-4 pr-4 text-white/75">{formatDate(lead.created_at)}</td>
                          <td className="py-4 pr-4 text-white/75">{lead.nombre || "-"}</td>
                          <td className="py-4 pr-4 text-white/75">{lead.telefono || "-"}</td>
                          <td className="py-4 pr-4 text-white/65">{lead.owner || "-"}</td>
                          <td className="py-4 pr-4">
                            <Badge color={getScoreColor(lead.score)}>Puntuación {lead.score || 0}</Badge>
                          </td>
                          <td className="py-4 pr-4">
                            <Badge color="blue">{getStatusLabel(lead.status)}</Badge>
                          </td>
                          <td className="py-4 pr-4">
                            <Badge color={getInterestColor(lead.interes)}>{lead.interes || "-"}</Badge>
                          </td>
                          <td className="py-4 pr-4 text-white/75">
                            {Number(lead.valor_estimado || settings.default_deal_value || 0)}€
                          </td>
                          <td className="py-4 pr-4">
                            <Badge color="green">{lead.predicted_close_probability || 0}%</Badge>
                          </td>
                          <td className="py-4 pr-4">
                            <div className="flex flex-wrap gap-2">
                              {lead.followup_sms_sent ? <Badge color="yellow">SMS</Badge> : null}
                              {lead.owner ? (
                                <Badge color="default">Con responsable</Badge>
                              ) : (
                                <Badge color="red">Sin responsable</Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-4 pr-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => openLead(lead)}
                                className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
                              >
                                Ver
                              </button>

                              <a
                                href={lead.telefono ? `tel:${lead.telefono}` : "#"}
                                className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
                              >
                                Llamar
                              </a>

                              <button
                                onClick={() => navigator.clipboard.writeText(lead.telefono || "")}
                                className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
                              >
                                Copiar
                              </button>

                              <button
                                onClick={() => openLeadWhatsApp(lead)}
                                className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
                              >
                                WhatsApp
                              </button>

                              {canEdit ? (
                                <>
                                  <button
                                    onClick={() => quickSmsFromTable(lead)}
                                    disabled={sendingSms}
                                    className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5 disabled:opacity-60"
                                  >
                                    SMS
                                  </button>

                                  <button
                                    onClick={() =>
                                      saveLeadChanges(lead.id, {
                                        status: "contacted",
                                        ultima_accion: "Marcado como contactado desde tabla",
                                      })
                                    }
                                    className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
                                  >
                                    Contactado
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </PanelCard>

            <PanelCard title="Últimas llamadas">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-white/45">
                      <th className="pb-3 pr-4">Fecha</th>
                      <th className="pb-3 pr-4">Estado</th>
                      <th className="pb-3 pr-4">Lead</th>
                      <th className="pb-3 pr-4">Duración</th>
                      <th className="pb-3 pr-4">Intento detectado</th>
                      <th className="pb-3 pr-4">Resumen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-white/40">
                          No hay llamadas registradas.
                        </td>
                      </tr>
                    ) : (
                      calls.slice(0, 20).map((call) => (
                        <tr key={call.id} className="border-b border-white/5 align-top">
                          <td className="py-4 pr-4 text-white/75">{formatDate(call.created_at)}</td>
                          <td className="py-4 pr-4">
                            <Badge color={(call.status || "") === "failed" ? "red" : "blue"}>
                              {call.status || "-"}
                            </Badge>
                          </td>
                          <td className="py-4 pr-4">
                            {call.lead_captured ? <Badge color="green">Capturado</Badge> : <Badge color="yellow">Sin lead</Badge>}
                          </td>
                          <td className="py-4 pr-4 text-white/75">{formatSeconds(call.duration_seconds)}</td>
                          <td className="py-4 pr-4 text-white/65">{call.detected_intent || "-"}</td>
                          <td className="max-w-xl py-4 pr-4 text-white/65">{call.summary || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </PanelCard>
          </div>

          <div className="space-y-6">
            <PanelCard title="Actividad en tiempo real" right={<Badge color="green">Actualización automática</Badge>}>
              <div className="space-y-3 text-sm text-white/70">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  El portal se actualiza automáticamente cada {data.settings?.realtime_refresh_seconds || 15} segundos.
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  Últimos cambios registrados: {auditLogs.length}
                </div>
              </div>
            </PanelCard>

            <PanelCard title="Equipo comercial" right={<Badge color="purple">{users.length}</Badge>}>
              <div className="space-y-3">
                {users.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/45">
                    No hay usuarios cargados todavía.
                  </div>
                ) : (
                  users.map((u) => (
                    <div key={u.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-white">{u.full_name}</div>
                          <div className="text-sm text-white/50">{u.email}</div>
                        </div>
                        <Badge color="blue">{u.role}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {canAdmin ? (
                <div className="mt-6 space-y-3 border-t border-white/10 pt-6">
                  <div className="text-sm text-white/45">Crear usuario</div>
                  <input
                    value={newUser.full_name}
                    onChange={(e) => setNewUser((u) => ({ ...u, full_name: e.target.value }))}
                    placeholder="Nombre completo"
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                  />
                  <input
                    value={newUser.email}
                    onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
                    placeholder="Email"
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                  />
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                  >
                    {["owner", "admin", "manager", "agent", "viewer"].map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <input
                    value={newUser.phone}
                    onChange={(e) => setNewUser((u) => ({ ...u, phone: e.target.value }))}
                    placeholder="Teléfono"
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                  />
                  <button
                    onClick={createUser}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black"
                  >
                    Crear usuario
                  </button>
                </div>
              ) : null}
            </PanelCard>

            <PanelCard title="Panel comercial" right={<Badge color="green">Equipo</Badge>}>
              <div className="space-y-3">
                {leadsByOwner.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/45">
                    No hay usuarios suficientes para mostrar rendimiento.
                  </div>
                ) : (
                  leadsByOwner.map((row) => (
                    <div key={row.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-white">{row.full_name}</div>
                          <div className="text-sm text-white/50">{row.role}</div>
                        </div>
                        <Badge color="blue">{row.leads} leads</Badge>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          <div className="text-white/45">Cualificados</div>
                          <div className="mt-1 font-semibold text-white">{row.qualified}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          <div className="text-white/45">Ganados</div>
                          <div className="mt-1 font-semibold text-white">{row.won}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                          <div className="text-white/45">Ingresos</div>
                          <div className="mt-1 font-semibold text-white">{row.revenue.toFixed(0)}€</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>

            <PanelCard title="Objetivos mensuales" right={<Badge color="green">Activos</Badge>}>
              <div className="space-y-4 text-sm text-white/70">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/45">Objetivo de leads</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {settings.monthly_target_leads || 25}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/45">Objetivo de conversión</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {settings.monthly_target_conversion || 20}%
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/45">Valor de operación</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {settings.default_deal_value || 250}€
                  </div>
                </div>
              </div>
            </PanelCard>

            <PanelCard title="Centro de alertas" right={<Badge color="red">{alerts.length}</Badge>}>
              <div className="space-y-3">
                {alerts.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/45">
                    No hay alertas activas.
                  </div>
                ) : (
                  alerts.slice(0, 8).map((alert) => (
                    <div key={alert.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-white">{alert.title}</div>
                        <Badge color={alert.severity === "high" ? "red" : alert.severity === "medium" ? "yellow" : "blue"}>
                          {alert.severity || "info"}
                        </Badge>
                      </div>
                      <div className="mt-2 text-sm text-white/65">{alert.message || "-"}</div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>

            <PanelCard title="Insights con IA" right={<Badge color="purple">{insights.length}</Badge>}>
              <div className="space-y-3">
                {insights.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/45">
                    Aún no hay insights.
                  </div>
                ) : (
                  insights.slice(0, 8).map((insight, idx) => (
                    <div key={insight.id || idx} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="font-medium text-white">{insight.title}</div>
                      <div className="mt-2 text-sm text-white/65">{insight.body}</div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>

            <PanelCard title="Branding del cliente" right={<Badge color="blue">{currentRole}</Badge>}>
              <div className="space-y-3">
                <input
                  disabled={!canAdmin}
                  value={brandingForm?.brand_name || ""}
                  onChange={(e) => setBrandingForm((f) => ({ ...f, brand_name: e.target.value }))}
                  placeholder="Nombre de marca"
                  className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white disabled:opacity-50"
                />
                <input
                  disabled={!canAdmin}
                  value={brandingForm?.brand_logo_url || ""}
                  onChange={(e) => setBrandingForm((f) => ({ ...f, brand_logo_url: e.target.value }))}
                  placeholder="URL del logo"
                  className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white disabled:opacity-50"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    disabled={!canAdmin}
                    value={brandingForm?.primary_color || ""}
                    onChange={(e) => setBrandingForm((f) => ({ ...f, primary_color: e.target.value }))}
                    placeholder="Color principal"
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white disabled:opacity-50"
                  />
                  <input
                    disabled={!canAdmin}
                    value={brandingForm?.secondary_color || ""}
                    onChange={(e) => setBrandingForm((f) => ({ ...f, secondary_color: e.target.value }))}
                    placeholder="Color secundario"
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white disabled:opacity-50"
                  />
                </div>
                <input
                  disabled={!canAdmin}
                  value={brandingForm?.owner_email || ""}
                  onChange={(e) => setBrandingForm((f) => ({ ...f, owner_email: e.target.value }))}
                  placeholder="Email del responsable"
                  className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white disabled:opacity-50"
                />
                <input
                  disabled={!canAdmin}
                  value={brandingForm?.industry || ""}
                  onChange={(e) => setBrandingForm((f) => ({ ...f, industry: e.target.value }))}
                  placeholder="Industria"
                  className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white disabled:opacity-50"
                />

                {canAdmin ? (
                  <button
                    onClick={saveBranding}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black"
                  >
                    Guardar branding
                  </button>
                ) : null}
              </div>
            </PanelCard>

            <PanelCard title="Ranking de rendimiento">
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 text-sm text-white/45">Mejores días</div>
                  <div className="space-y-2 text-sm text-white/70">
                    {rankings.bestDays?.slice(0, 5).map((item) => (
                      <div key={item.label} className="flex items-center justify-between">
                        <span>{item.label}</span>
                        <span>{item.conversion}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 text-sm text-white/45">Mejores horas</div>
                  <div className="space-y-2 text-sm text-white/70">
                    {rankings.bestHours?.slice(0, 5).map((item) => (
                      <div key={item.label} className="flex items-center justify-between">
                        <span>{item.label}</span>
                        <span>{item.conversion}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </PanelCard>

            <PanelCard title="Registro de actividad" right={<Badge color="blue">{auditLogs.length}</Badge>}>
              <div className="space-y-3">
                {auditLogs.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/45">
                    No hay cambios registrados todavía.
                  </div>
                ) : (
                  auditLogs.slice(0, 8).map((log) => (
                    <div key={log.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-white">{log.action}</div>
                        <div className="text-xs text-white/45">{formatDate(log.created_at)}</div>
                      </div>
                      <div className="mt-2 text-sm text-white/65">
                        {log.entity_type} · {log.entity_id}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>
          </div>
        </div>
      </main>

      <LeadDrawer
        lead={selectedLead}
        events={leadEvents}
        notes={leadNotes}
        comments={leadComments}
        reminders={leadReminders}
        call={
          selectedLead
            ? (data.calls || []).find((call) => {
                const sameDate =
                  selectedLead.created_at &&
                  call.created_at &&
                  new Date(selectedLead.created_at).toDateString() ===
                    new Date(call.created_at).toDateString();

                const sameName =
                  selectedLead.nombre &&
                  call.summary &&
                  call.summary.toLowerCase().includes(String(selectedLead.nombre).toLowerCase());

                return sameDate || sameName;
              }) || null
            : null
        }
        users={data.users || []}
        canEdit={canEdit}
        sendingSms={sendingSms}
        smsTemplates={smsTemplates}
        whatsappTemplates={whatsappTemplates}
        clientBrand={client.brand_name || client.name || "nuestro equipo"}
        onClose={() => {
          setSelectedLead(null);
          setLeadEvents([]);
          setLeadNotes([]);
          setLeadComments([]);
          setLeadReminders([]);
        }}
        onSave={saveLeadChanges}
        onAddNote={addNote}
        onAddComment={addComment}
        onAddReminder={addReminder}
        onGenerateNextStep={generateNextStep}
        onSendFollowupSms={sendFollowupSms}
      />
    </div>
  );
}