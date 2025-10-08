use axum::{
    routing::{get, patch},
    Router, Json, extract::{State, Path, Query},
    http::StatusCode,
    response::{IntoResponse, Response}
};
use serde::{Deserialize, Serialize};
use crate::api::AppState;
use crate::db::{operations_generic::{FeedOpsGeneric, FeedItemOpsGeneric, FeedEmailRuleOpsGeneric}, models::{NewFeed, Feed}};
use crate::feed::generator::FeedGenerator;

#[derive(Debug, Serialize, Deserialize)]
pub struct FeedResponse {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub link: Option<String>,
    pub email_rule_ids: Vec<String>,
    pub feed_type: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub max_items: Option<i32>,
    pub max_age_days: Option<i32>,
    pub min_items: Option<i32>,
}

impl FeedResponse {
    fn from_feed_with_rules(feed: Feed, rule_ids: Vec<String>) -> Self {
        Self {
            id: feed.id.unwrap_or_default(),
            title: feed.title,
            description: feed.description,
            link: feed.link,
            email_rule_ids: rule_ids,
            feed_type: feed.feed_type,
            is_active: feed.is_active,
            created_at: feed.created_at,
            updated_at: feed.updated_at,
            max_items: feed.max_items,
            max_age_days: feed.max_age_days,
            min_items: feed.min_items,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateFeedRequest {
    pub title: String,
    pub description: Option<String>,
    pub link: Option<String>,
    pub email_rule_ids: Vec<String>,
    pub feed_type: String,
    pub is_active: bool,
    pub max_items: Option<i32>,
    pub max_age_days: Option<i32>,
    pub min_items: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateFeedRequest {
    pub title: String,
    pub description: Option<String>,
    pub link: Option<String>,
    pub email_rule_ids: Vec<String>,
    pub feed_type: String,
    pub is_active: bool,
    pub max_items: Option<i32>,
    pub max_age_days: Option<i32>,
    pub min_items: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct FeedItemsQuery {
    limit: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FeedItemMetadata {
    pub id: String,
    pub title: String,
    pub pub_date: String,
    pub author: Option<String>,
    pub is_read: Option<bool>,
    pub starred: Option<bool>,
    pub body_size: Option<i32>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateFeedItemRequest {
    pub is_read: Option<bool>,
    pub starred: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    error: String,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/feeds", get(list_feeds).post(create_feed))
        .route("/api/feeds/:id", get(get_feed).put(update_feed).delete(delete_feed))
        .route("/api/feeds/:id/items", get(get_feed_items))
        .route("/api/feeds/:id/items/metadata", get(get_feed_items_metadata))
        .route("/api/feed-items/:id", patch(update_feed_item))
        .route("/feeds/:id/rss", get(get_rss_feed))
        .route("/feeds/:id/atom", get(get_atom_feed))
}

async fn list_feeds(State(state): State<AppState>) -> Response {
    let feeds = match FeedOpsGeneric::get_all(&state.pool) {
        Ok(f) => f,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Failed to fetch feeds: {}", e) })).into_response(),
    };

    // Convert feeds to FeedResponse with rule IDs
    let feed_responses: Vec<FeedResponse> = feeds.into_iter()
        .filter_map(|feed| {
            let feed_id = feed.id.as_ref()?.clone();
            let rule_ids = FeedEmailRuleOpsGeneric::get_rule_ids_for_feed(&state.pool, &feed_id)
                .unwrap_or_default();
            Some(FeedResponse::from_feed_with_rules(feed, rule_ids))
        })
        .collect();

    Json(feed_responses).into_response()
}

async fn create_feed(
    State(state): State<AppState>,
    Json(req): Json<CreateFeedRequest>
) -> Response {
    let new_feed = NewFeed::with_retention(
        req.title,
        req.description,
        req.link,
        req.feed_type,
        req.is_active,
        req.max_items,
        req.max_age_days,
        req.min_items,
    );

    // Create the feed
    let feed = match FeedOpsGeneric::create(&state.pool, &new_feed) {
        Ok(f) => f,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Failed to create feed: {}", e) })).into_response(),
    };

    // Get the feed ID
    let feed_id = match &feed.id {
        Some(id) => id.clone(),
        None => return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: "Created feed has no ID".to_string() })).into_response(),
    };

    // Create the feed-rule relationships
    if let Err(e) = FeedEmailRuleOpsGeneric::set_feed_rules(&state.pool, &feed_id, &req.email_rule_ids) {
        // If creating relationships fails, delete the feed and return error
        let _ = FeedOpsGeneric::delete(&state.pool, &feed_id);
        return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Failed to set feed rules: {}", e) })).into_response();
    }

    // Return FeedResponse with rule IDs
    let feed_response = FeedResponse::from_feed_with_rules(feed, req.email_rule_ids);
    (StatusCode::CREATED, Json(feed_response)).into_response()
}

async fn get_feed(
    State(state): State<AppState>,
    Path(id): Path<String>
) -> Response {
    let feed = match FeedOpsGeneric::get_by_id(&state.pool, &id) {
        Ok(f) => f,
        Err(e) => return (StatusCode::NOT_FOUND,
            Json(ErrorResponse { error: format!("Feed not found: {}", e) })).into_response(),
    };

    let rule_ids = FeedEmailRuleOpsGeneric::get_rule_ids_for_feed(&state.pool, &id)
        .unwrap_or_default();

    let feed_response = FeedResponse::from_feed_with_rules(feed, rule_ids);
    Json(feed_response).into_response()
}

async fn update_feed(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateFeedRequest>
) -> Response {
    let updated_feed = NewFeed::with_retention(
        req.title,
        req.description,
        req.link,
        req.feed_type,
        req.is_active,
        req.max_items,
        req.max_age_days,
        req.min_items,
    );

    // Update the feed
    let feed = match FeedOpsGeneric::update(&state.pool, &id, &updated_feed) {
        Ok(f) => f,
        Err(e) => return (StatusCode::NOT_FOUND,
            Json(ErrorResponse { error: format!("Failed to update feed: {}", e) })).into_response(),
    };

    // Update the feed-rule relationships
    if let Err(e) = FeedEmailRuleOpsGeneric::set_feed_rules(&state.pool, &id, &req.email_rule_ids) {
        return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Failed to set feed rules: {}", e) })).into_response();
    }

    // Return FeedResponse with updated rule IDs
    let feed_response = FeedResponse::from_feed_with_rules(feed, req.email_rule_ids);
    Json(feed_response).into_response()
}

async fn delete_feed(
    State(state): State<AppState>,
    Path(id): Path<String>
) -> Response {
    let mut conn = match state.pool.get() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Database connection error: {}", e) })).into_response(),
    };

    match FeedOpsGeneric::delete(&state.pool, &id) {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::NOT_FOUND,
            Json(ErrorResponse { error: format!("Failed to delete feed: {}", e) })).into_response(),
    }
}

async fn get_feed_items(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<FeedItemsQuery>
) -> Response {
    let mut conn = match state.pool.get() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Database connection error: {}", e) })).into_response(),
    };

    match FeedItemOpsGeneric::get_by_feed_id(&state.pool, &id, params.limit) {
        Ok(items) => Json(items).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Failed to fetch feed items: {}", e) })).into_response(),
    }
}

// Helper function to get feed data and items
async fn get_feed_data(state: &AppState, id: &str) -> Result<(crate::db::models::Feed, Vec<crate::db::models::FeedItem>), Response> {
    let mut conn = match state.pool.get() {
        Ok(conn) => conn,
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Database connection error: {}", e) })).into_response()),
    };

    // Get the feed metadata
    let feed = match FeedOpsGeneric::get_by_id(&state.pool, id) {
        Ok(feed) => feed,
        Err(e) => {
            // Check if it's a not found error by checking the error message
            let error_msg = e.to_string();
            if error_msg.contains("not found") || error_msg.contains("NotFound") {
                return Err((StatusCode::NOT_FOUND,
                    Json(ErrorResponse { error: format!("Feed with ID '{}' not found", id) })).into_response());
            } else {
                return Err((StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse { error: format!("Database error retrieving feed: {}", e) })).into_response());
            }
        }
    };

    // Get feed items (limit to most recent items, configurable via env var)
    let item_limit = std::env::var("FEED_ITEM_LIMIT")
        .unwrap_or_else(|_| "50".to_string())
        .parse::<i64>()
        .unwrap_or(50);
    let items = match FeedItemOpsGeneric::get_by_feed_id(&state.pool, id, Some(item_limit)) {
        Ok(items) => items,
        Err(e) => return Err((StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Failed to fetch feed items: {}", e) })).into_response()),
    };

    Ok((feed, items))
}

async fn get_rss_feed(
    State(state): State<AppState>,
    Path(id): Path<String>
) -> Response {
    let (feed, items) = match get_feed_data(&state, &id).await {
        Ok(data) => data,
        Err(error_response) => return error_response,
    };

    // Generate RSS feed
    match FeedGenerator::generate_rss(&feed, &items) {
        Ok(rss_content) => {
            let cache_duration = get_cache_duration();
            (StatusCode::OK, [
                ("content-type", "application/rss+xml; charset=utf-8"),
                ("cache-control", &format!("public, max-age={}", cache_duration)),
            ], rss_content).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Failed to generate RSS feed: {}", e) })).into_response(),
    }
}

// Helper function to get cache duration from environment
fn get_cache_duration() -> String {
    std::env::var("FEED_CACHE_DURATION")
        .unwrap_or_else(|_| "300".to_string())
}

async fn get_atom_feed(
    State(state): State<AppState>,
    Path(id): Path<String>
) -> Response {
    let (feed, items) = match get_feed_data(&state, &id).await {
        Ok(data) => data,
        Err(error_response) => return error_response,
    };

    // Generate Atom feed
    match FeedGenerator::generate_atom(&feed, &items) {
        Ok(atom_content) => {
            let cache_duration = get_cache_duration();
            (StatusCode::OK, [
                ("content-type", "application/atom+xml; charset=utf-8"),
                ("cache-control", &format!("public, max-age={}", cache_duration)),
            ], atom_content).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Failed to generate Atom feed: {}", e) })).into_response(),
    }
}

/// Get feed items metadata for management UI
async fn get_feed_items_metadata(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<FeedItemsQuery>
) -> Response {
    let mut conn = match state.pool.get() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Database connection error: {}", e) })).into_response(),
    };
    
    match FeedItemOpsGeneric::get_by_feed_id(&state.pool, &id, params.limit) {
        Ok(items) => {
            let metadata: Vec<FeedItemMetadata> = items.into_iter().map(|item| {
                FeedItemMetadata {
                    id: item.id.unwrap_or_else(|| "unknown".to_string()),
                    title: item.title,
                    pub_date: item.pub_date,
                    author: item.author,
                    is_read: item.is_read,
                    starred: item.starred,
                    body_size: item.body_size,
                    created_at: item.created_at,
                }
            }).collect();
            Json(metadata).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Failed to fetch feed items metadata: {}", e) })).into_response(),
    }
}

/// Update feed item metadata (read status, starred, etc.)
async fn update_feed_item(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateFeedItemRequest>
) -> Response {
    let mut conn = match state.pool.get() {
        Ok(conn) => conn,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Database connection error: {}", e) })).into_response(),
    };
    
    // Get the existing item
    let mut item = match FeedItemOpsGeneric::get_by_id(&state.pool, &id) {
        Ok(item) => item,
        Err(e) => return (StatusCode::NOT_FOUND,
            Json(ErrorResponse { error: format!("Feed item not found: {}", e) })).into_response(),
    };
    
    // Update the metadata fields
    if let Some(is_read) = payload.is_read {
        item.is_read = Some(is_read);
    }
    if let Some(starred) = payload.starred {
        item.starred = Some(starred);
    }
    
    // Save the updated item (this requires implementing an update method)
    match update_feed_item_metadata(&state.pool, &item) {
        Ok(_) => (StatusCode::OK, Json(item)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("Failed to update feed item: {}", e) })).into_response(),
    }
}

/// Helper function to update feed item metadata
fn update_feed_item_metadata(
    pool: &crate::db::connection::DatabasePool,
    item: &crate::db::models::FeedItem
) -> anyhow::Result<()> {
    use crate::db::schema::feed_items::dsl::*;
    use crate::db::connection::DatabasePool;
    use diesel::prelude::*;

    let item_id = item.id.as_ref()
        .ok_or_else(|| anyhow::anyhow!("Item has no ID"))?;

    match pool {
        DatabasePool::SQLite(sqlite_pool) => {
            let mut conn = sqlite_pool.get()?;
            diesel::update(feed_items.filter(id.eq(item_id)))
                .set((
                    is_read.eq(&item.is_read),
                    starred.eq(&item.starred),
                ))
                .execute(&mut conn)
                .map_err(|e| anyhow::anyhow!("Failed to update feed item: {}", e))?;
        }
        #[cfg(feature = "postgres")]
        DatabasePool::PostgreSQL(pg_pool) => {
            let mut conn = pg_pool.get()?;
            diesel::update(feed_items.filter(id.eq(item_id)))
                .set((
                    is_read.eq(&item.is_read),
                    starred.eq(&item.starred),
                ))
                .execute(&mut conn)
                .map_err(|e| anyhow::anyhow!("Failed to update feed item: {}", e))?;
        }
    }

    Ok(())
}