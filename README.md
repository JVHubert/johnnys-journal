# Johnny's Journal

App pessoal do JV (PWA) com três telas:

- **Hoje**: hábitos do dia e o dia em um tweet.
- **Entrevista**: perguntas por tema, respondidas por voz; o texto é copiado para o Claude montar a entrada do diário.
- **Mês**: bujo com a página dos dias (tweets) e a página do habit tracker.

Os registros ficam só no celular (localStorage). Nada é enviado para servidor.

Abrir com `?demo` mostra dados inventados, sem salvar nada.

A cada mudança, aumente `VERSAO` em `sw.js`.
