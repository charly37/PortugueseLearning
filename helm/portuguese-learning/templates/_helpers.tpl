{{/*
Expand the name of the chart.
*/}}
{{- define "portuguese-learning.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "portuguese-learning.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{ include "portuguese-learning.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "portuguese-learning.selectorLabels" -}}
app.kubernetes.io/name: {{ include "portuguese-learning.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
