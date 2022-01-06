function logout(base) {
    document.cookie = `session=; Max-Age=-1;secure;path=${base}`
    window.location.reload();
}

function upvote(element) {
    const counter = element.parentNode.querySelector(".upvote-counter");
    const button = element.parentNode.querySelector(".upvote-button");

    if (counter) {
        counter.textContent = (parseInt(counter.textContent) + 1).toString();
        counter.classList.add("upvoted");
    }

    if (button) {
        button.classList.add("upvoted");
    }
}

function toggleOpen(element) {
    element.parentNode.classList.toggle('closed');
}

const upvoteButtons = document.querySelectorAll(".upvote-button")
const filterButtons = document.querySelectorAll(".filter-toggle");

filterButtons.forEach(element => {
    element.addEventListener("click", () => {
        toggleOpen(element);
    });
});

upvoteButtons.forEach(element => {
    element.addEventListener("click", () => {
        upvote(element);
    });
});