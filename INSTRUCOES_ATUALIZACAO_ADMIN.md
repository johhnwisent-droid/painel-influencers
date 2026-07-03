# FIT COACH PRO - Correção Cloudflare /admin

## O que foi corrigido

O deploy estava falhando por causa de regras inválidas em `public/_redirects`.
A Cloudflare detectou loop nas regras que apontavam `/admin/*` para `/admin/index.html` e `/*` para `/index.html`.

Nesta versão, o arquivo `public/_redirects` foi esvaziado para não criar loop.
A navegação `/admin` fica controlada pelo próprio React e pelo `wrangler.jsonc`, que já possui:

```json
"not_found_handling": "single-page-application"
```

## Arquivos importantes alterados

- `public/_redirects` — limpo/sem regras para evitar erro de deploy.
- `src/App.jsx` — detecta `/admin` pela URL e abre o login administrativo.
- `admin/index.html` — entrada administrativa preservada.
- `vite.config.js` — mantém build com entrada principal e admin.
- `public/service-worker.js` — cache atualizado.

## Atenção ao subir no GitHub

Se no GitHub ainda existir um `_redirects` antigo com regras, substitua pelo arquivo vazio desta versão ou apague o conteúdo dele.

O arquivo `public/_redirects` NÃO deve conter estas regras:

```txt
/admin /admin/index.html 200
/admin/ /admin/index.html 200
/admin/* /admin/index.html 200
/* /index.html 200
```

Essas regras causam erro de deploy na Cloudflare.

## Depois do deploy

Acesse:

```txt
https://coachfitpro.com.br/admin
```

Login admin:

```txt
sac@coachfitpro.com.br
```

Não é necessário rodar outro SQL se o SQL anterior do Admin Master já foi executado.
