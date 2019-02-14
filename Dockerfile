FROM node:8.6.0

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Bundle app source
COPY . .

EXPOSE 3535
CMD [ "npm", "start" ]

# Build
# docker build -t restbus .

# Run
# docker run -p 3535:3535 restbus:latest
