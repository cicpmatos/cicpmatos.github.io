---
title: Duas APIs, uma análise
description: Como usei dados do Chess.com e uma dimensão de países do Banco Mundial para ampliar a análise dos meus adversários.
slug: integracao-apis-xadrez
category: Power BI
---

## O contexto

Gosto de jogar xadrez e acompanho minhas partidas no Chess.com. Para transformar esse histórico em indicadores, utilizei a API pública da plataforma como fonte de um dashboard no Power BI.

Além do resultado e da evolução do rating, queria entender melhor o perfil dos adversários. Um dos campos relevantes era o código do país, que sozinho nem sempre é a melhor informação para apresentar em gráficos e filtros.

## A solução: uma dimensão de países

Utilizei o endpoint público [World Bank Country API](https://api.worldbank.org/v2/country?format=json&per_page=400) para obter códigos ISO de duas letras e nomes dos países. No Power Query, converti o JSON em tabela, selecionei os campos necessários e descartei códigos vazios.

Este é o exemplo em linguagem M utilizado na transformação:

```powerquery
let
    Fonte = Json.Document(
        Web.Contents(
            "https://api.worldbank.org",
            [
                RelativePath = "v2/country",
                Query = [
                    format = "json",
                    per_page = "400"
                ]
            ]
        )
    ),
    Dados = Fonte{1},
    Tabela = Table.FromRecords(Dados),
    SelecionarColunas = Table.SelectColumns(
        Tabela, {"iso2Code", "name"}
    ),
    RenomearColunas = Table.RenameColumns(
        SelecionarColunas,
        {{"iso2Code", "Sigla País"}, {"name", "País"}}
    ),
    RemoverNulos = Table.SelectRows(
        RenomearColunas,
        each [Sigla País] <> null and [Sigla País] <> ""
    ),
    Tipos = Table.TransformColumnTypes(
        RemoverNulos,
        {{"Sigla País", type text}, {"País", type text}}
    )
in
    Tipos
```

## Como os dados se conectam

A proposta é relacionar a sigla do país disponível nos dados dos adversários à dimensão de países. Assim, o nome do país se torna utilizável em segmentações e análises. É importante conferir correspondências e eventuais códigos não encontrados, pois diferentes fontes podem adotar convenções distintas.

## Além da extração

- O tratamento dos dados foi realizado no Power Query.
- As análises do dashboard usam medidas DAX.
- O projeto tem um Dataflow no Power BI Service com atualização diária configurada.
- O relatório também utiliza atualização diária e está incorporado ao portfólio.

Essa experiência mostra como um pequeno enriquecimento de dados pode ampliar as perguntas que um dashboard responde, indo além do histórico bruto de partidas.

**Veja a aplicação:** o relatório interativo está disponível na [página do projeto de xadrez](/projetos/analise-xadrez.html).
