var
    FeedParser = require('feedparser'),
    format = require('util'),
    request = require('request'),
    MongoClient = require('mongodb').MongoClient,
    MannersModule = require('../../Manners'),
    Manners;
/**
 * Module tasked with gathering content from rss feeds of blogs and sites approved for bot
 * @class
 *
 * @author Zack Proser
 */
class Pedantry {
    constructor() {
        Manners = new MannersModule()
        this.init();
    }

    init() {
        /**
         * Subscribe to TimeManager Dispatches
         */
        app.get('channel').on('commandScrape', () => {
            this.scrapeFeed()
        })
    }

    /**
     * Save a retrieved content item in the collection that stores content for tweets
     *
     * @param  {string} title - The title of the article to save
     * @param  {string} origin - The name of the site that published the content
     * @param  {string} original_link - The full url to the piece of content
     */
    storeTweet(title, origin, original_link) {
        //Store tweet expects that title, origin and original_link are all valid strings
        if (!Manners.isAValidFeedContentItem(title, origin, original_link)) {
            console.log('failure')
            app.get('logger').error('Scraper:storeTweet got tweet with invalid title, oriing or original_link. Bailing')
            return
        }
        app.get('tweet_collection').insert({ 'title': title, 'origin': origin, 'original_link': original_link, 'tweeted': false }, (err, doc) => {
            if (err) {
                /*
                 * Just log as info insert failed because of duplicate key errors
                 */
                if (err.code == 11000) {
                    app.get('logger').info('Duplicate stored tweet found - record not written')
                } else {
                    app.get('logger').error(err)
                }
                return
            } else {
                app.get('logger').info('Scraper Inserted Record: ')
                app.get('logger').info(doc)
                app.get('tweet_collection').count((err, count) => {
                    if (err) {
                        app.get('logger').error(err)
                    }
                })
            }
        })
    }

    /**
     * Choose a random approved feed and scrape content from it
     */
    scrapeFeed() {
        var self = this
        let chosen_feed = app.get('settings').scraper.feeds.random()

        var req = request(chosen_feed)
        var feedparser = new FeedParser()

        req.on('error', function(error) {
            // handle any request errors
            app.get('logger').error(`Pedantry error getting feed: ${chosen_feed} : ${error}`)
        })

        req.on('response', function(res) {
            var stream = this; // `this` is `req`, which is a stream

            if (res.statusCode !== 200) {
                this.emit('error', new Error('Bad status code'))
            } else {
                stream.pipe(feedparser)
            }
        })

        feedparser.on('error', function(error) {
            // always handle errors
            app.get('logger').error(`Pedantry error parsing feed: ${chosen_feed} : ${error}`)
        })

        feedparser.on('readable', function() {
            // This is where the action is!
            var stream = this; // `this` is `feedparser`, which is a stream
            var meta = this.meta; // **NOTE** the "meta" is always available in the context of the feedparser instance
            var item;

            while (item = stream.read()) {
                if (item.title) {
                    var title = item.title
                } else {
                    app.get('logger').warn("Found no title - skipping")
                    return
                }
                if (item.link) {
                    var original_url = item.link
                } else {
                    app.get('logger').warn("Found no link - skipping")
                    return
                }
                if (title && original_url) {
                    self.storeTweet(title, meta.title, original_url)
                }
            }
        })
    }
}

module.exports = Pedantry;