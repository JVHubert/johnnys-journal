# Johnny's Journal

App pessoal do JV (PWA) com três telas:

- **Hoje**: hábitos do dia e o dia em um tweet.
- **Entrevista**: perguntas por tema, respondidas por voz; o texto é copiado para o Claude montar a entrada do diário.
- **Mês**: bujo com a página dos dias (tweets) e a página do habit tracker.

Os registros ficam no celular (localStorage). Se o JV ligar o backup automático, o app grava uma cópia no repositório privado JVHubert/johnnys-journal-dados, com um token que só existe no celular dele.

Abrir com `?demo` mostra dados inventados, sem salvar nada.

A cada mudança, aumente `VERSAO` em `sw.js`.
