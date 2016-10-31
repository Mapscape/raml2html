FROM node:0.12

WORKDIR /usr/app

# Copy all raml2html sources
COPY . /usr/app/

# Install raml2html
RUN npm install

# Always run raml2html
ENTRYPOINT ["bin/raml2html"]
# Allow the user to specify the file
CMD ["spec.raml"]
