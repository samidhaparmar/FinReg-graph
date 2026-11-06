"""Neo4j projection of the evidence store. SQL remains the source of truth."""
from neo4j import GraphDatabase

from finreg.config import settings


def project_document(document, passages, obligations) -> None:
    driver = GraphDatabase.driver(settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password))
    try:
        with driver.session() as session:
            session.run("CREATE CONSTRAINT regulation_id IF NOT EXISTS FOR (r:Regulation) REQUIRE r.id IS UNIQUE")
            session.run("CREATE CONSTRAINT article_id IF NOT EXISTS FOR (a:Article) REQUIRE a.id IS UNIQUE")
            session.run("CREATE CONSTRAINT obligation_id IF NOT EXISTS FOR (o:Obligation) REQUIRE o.id IS UNIQUE")
            session.run("CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE")
            session.run("MERGE (r:Regulation {id:$id}) SET r.title=$title, r.version=$version", id=document.id, title=document.title, version=document.version)
            article_pages = {(p.article, p.page) for p in passages if p.article}
            for article, page in article_pages:
                aid = f"{document.id}:{article}"
                session.run("MATCH (r:Regulation {id:$rid}) MERGE (a:Article {id:$aid}) SET a.label=$label MERGE (r)-[:HAS_ARTICLE]->(a)", rid=document.id, aid=aid, label=article)
            for item in obligations:
                p = next(p for p in passages if p.id == item.passage_id)
                aid = f"{document.id}:{p.article}"
                eid = item.subject.casefold()
                session.run("MATCH (a:Article {id:$aid}) MERGE (o:Obligation {id:$oid}) SET o.action=$action, o.confidence=$confidence, o.passage_id=$pid, o.page=$page MERGE (a)-[:STATES]->(o) MERGE (e:Entity {id:$eid}) SET e.name=$name MERGE (o)-[:APPLIES_TO {evidence:$evidence}]->(e)", aid=aid, oid=item.id, action=item.action, confidence=item.confidence, pid=p.id, page=p.page, eid=eid, name=item.subject, evidence=p.text)
            for passage in passages:
                aid = f"{document.id}:{passage.article}"
                for entity in passage.entities:
                    eid = f"{entity['type']}:{entity['text'].casefold()}"
                    session.run("MATCH (a:Article {id:$aid}) MERGE (e:Entity {id:$eid}) SET e.name=$name, e.type=$kind MERGE (a)-[:MENTIONS]->(e)", aid=aid, eid=eid, name=entity["text"], kind=entity["type"])
    finally:
        driver.close()


def neighbors(obligation_ids: list[str]) -> list[dict]:
    if not obligation_ids:
        return []
    driver = GraphDatabase.driver(settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password))
    try:
        with driver.session() as session:
            rows = session.run("MATCH (a:Article)-[:STATES]->(o:Obligation)-[:APPLIES_TO]->(e:Entity) WHERE o.id IN $ids RETURN a.label AS article, o.id AS obligation_id, e.name AS entity", ids=obligation_ids)
            return [dict(row) for row in rows]
    finally:
        driver.close()


def project_profile(profile) -> None:
    driver = GraphDatabase.driver(settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password))
    try:
        with driver.session() as session:
            session.run("MERGE (p:BusinessProfile {id:$id}) SET p.name=$name, p.entity_type=$entity_type", id=profile.id, name=profile.name, entity_type=profile.entity_type)
            for activity in profile.activities:
                session.run("MATCH (p:BusinessProfile {id:$id}) MERGE (b:BusinessProcess {id:$bid}) SET b.name=$name MERGE (p)-[:PERFORMS]->(b)", id=profile.id, bid=activity.casefold(), name=activity)
    finally:
        driver.close()
