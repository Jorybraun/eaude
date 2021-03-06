const redis = require('redis')

export const client = redis.createClient(6379, process.env.REDIS_HOST)

client.on("error", function(err) {
  console.log("Error " + err);
})

export const shouldFlush = (time) => {
  return new Promise((resolve, reject) => {
    client.get('posts:ttl', (err, ttl) => {
      if (err) reject(err)
      const now = new Date().getTime()
      resolve((now - ttl) > time)
    })
  })
}

export const flushCache = () => {
  return new Promise((resolve, reject) => {
    client.flushall((err, res) => {
      if (err) reject (err)
      resolve(res)
    })
  })
}

export const checkPostCache = (postKeys) => {
  return new Promise((resolve, reject) => {
    client.exists(...postKeys, (err, postCount) => {
      if (err) reject (err)
      resolve(postCount === 5)
    })
  })
}

const mapPairs = (pairs) => 
  pairs.map(([originalPost, altPhotos]) => 
    ({ originalPost, altPhotos }))

export const buildPostsFromCache = (postKeys) => {
  const posts = postKeys.map((key) => {
    return Promise.all([
      getOriginalPostFromCache(key),
      getAltPhotosFromCache(key)
    ])
  })
  return Promise.all(posts).then(pairs => mapPairs(pairs))
}

export const getOriginalPostFromCache = (key) => {
  return new Promise((resolve, reject) => {
    client.hgetall(key, (err, data) => {
      if (err) reject(err)
      resolve(data)
    })
  })
}

export const getAltPhotosFromCache = (key) => {
  return new Promise((resolve, reject) => {
    client.zrange(`${key}:altPhotos`, 0, -1, (err, data) => {
      if (err) reject(err)
      resolve(data)
    })
  })
}

export const getPostCountFromCache = () => 
  new Promise((resolve, reject) => {
    client.get('posts:count', (err, data) => {
      if (err) reject(err)
      resolve(data)
    })
  })

export const hydratePostCache = (blog, offset) => { 
  new Promise((resolve, reject) => {
    blog.posts.forEach((post, i) => {
      const photo = post.photos[0]
      const altSizes = photo.alt_sizes
      const current = offset+i
      const postKey = `post:${current}`
      
      client.hmset(postKey, {
        'caption': post.caption,
        'width': photo.original_size.width,
        'height': photo.original_size.height,
        'url': photo.original_size.url
      })

      Object.entries(altSizes)
        .forEach((entry) => {
          client.zadd(`${postKey}:altPhotos`, entry[0],  entry[1].url)
        })  

      client.zadd('posts', current, postKey)
      // TODO: set expirety date here to refresh the cache
      client.set('posts:count', blog.total_posts)
      client.set('posts:ttl', new Date().getTime())
    })
    resolve(true)
  })
}

export default client